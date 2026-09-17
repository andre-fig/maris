# Maris

Monorepo do aplicativo móvel Maris e de sua API administrativa.

## Estrutura

```text
apps/
  mobile/  React Native + Expo + MapLibre
  api/     NestJS + TypeScript
data/      arquivos ENC locais (ignorado pelo Git)
```

## Requisitos

- Node.js 20 ou superior
- pnpm 9
- Xcode para executar o app no iOS
- PostgreSQL
- GDAL/OGR e `unzip` para processar ENC localmente

## Instalação

```bash
pnpm install
```

## Mobile

```bash
pnpm dev:mobile
pnpm ios
```

O código do aplicativo está em `apps/mobile`. A fonte vetorial continua sendo
descoberta pelo TileJSON; o app não conhece versões nem caminhos de storage.

## API

A API segue a organização modular do NestJS: `AppModule`, módulos de
configuração e banco, e ingestões separadas em controller, DTOs e services.

Copie as variáveis de ambiente e inicie a API:

```bash
cp apps/api/.env.example apps/api/.env
set -a
source apps/api/.env
set +a
pnpm dev:api
```

### Receber um conjunto ENC

`POST /ingestions/enc` recebe um único campo multipart chamado `file`.

```bash
curl --fail-with-body \
  -F 'file=@FL_ENCs.zip;type=application/zip' \
  http://localhost:3001/ingestions/enc
```

A API transmite o upload diretamente para disco, calcula SHA-256, valida a
estrutura ZIP, bloqueia caminhos inseguros e arquivos criptografados, confere
os limites de expansão e identifica as células S-57 `.000` e seus updates.
O ZIP original fica em `.storage/ingestions/<id>` e os metadados são persistidos
no PostgreSQL.

Para consultar o estado e a rastreabilidade da ingestão:

```bash
curl --fail-with-body \
  http://localhost:3001/ingestions/<id>
```

Depois da resposta `received`, o dispatcher inicia automaticamente o pipeline.
Os estados persistidos são `received`, `validating`, `processing`, `ready`,
`failed` e `published`. O trabalho pesado roda em processos GDAL/gerador
separados do processo HTTP. Ingestões interrompidas são retomadas na próxima
inicialização da API.

## Pipeline e tiles vetoriais

O fluxo cartográfico é executado antes da publicação:

```text
S-57 .000 + updates .001/.002
  -> GDAL/OGR (UPDATES=APPLY)
  -> GeoJSON normalizado temporário
  -> MVT/PBF pré-processados
  -> storage versionado
  -> servidor estático/CDN
  -> TileJSON do NestJS
  -> MapLibre Native
```

O GeoJSON é intermediário e temporário. Após o upload, o pipeline extrai o ZIP,
aplica os updates com `UPDATES=APPLY`, normaliza `SOUNDG`, executa
`build-soundg-tiles.ts` em processo separado e grava os PBFs antes de marcar a
versão como `ready`. Se a pasta da versão já existir, a geração falha em vez de
sobrescrever artefatos publicados.

O storage local/Railway tem esta estrutura:

```text
.storage/chart-data/
  soundg/
    versions/
      miami-soundg-v1/
        manifest.json
        {z}/{x}/{y}.pbf
      miami-soundg-v2/
        manifest.json
        {z}/{x}/{y}.pbf
```

O PostgreSQL é a fonte de verdade para a versão ativa. A publicação aceita
somente versões `ready` e, na mesma transação, desativa a versão anterior, ativa
a nova e registra os timestamps. Os arquivos anteriores ficam intactos para
rollback e clientes offline. No Railway, `.storage/chart-data` está no volume
persistente, separado da imagem Docker. O Nginx lê os PBFs diretamente desse
volume; as requisições de tiles não chegam ao processo NestJS.

O NestJS consulta a versão `published` e `active` no banco e lê somente seu
pequeno `manifest.json` para responder:

```text
GET /tiles/soundg.json
```

O TileJSON aponta para a versão ativa usando a URL compatível
`/tiles/soundg/{version}/{z}/{x}/{y}.pbf`. Essa rota é atendida diretamente pelo
Nginx com cache imutável de um ano. Para migrar a distribuição para S3, R2 ou
uma CDN, basta configurar `CHART_ASSET_BASE_URL`; o TileJSON passa a usar
`<base>/soundg/versions/{version}/{z}/{x}/{y}.pbf`, sem mudança no app ou na
lógica de mapa. A interface `ChartStorage` isola a descoberta dos manifestos da
implementação local atual.

O comando abaixo permanece disponível como ferramenta de diagnóstico para
gerar um artefato sem publicá-lo. O fluxo normal não depende dele:

```bash
pnpm --filter @maris/api build:tiles -- \
  --input /caminho/soundg.json \
  --storage-dir ../../.storage/chart-data \
  --version miami-soundg-v3
```

No mobile, a `VectorSource` do MapLibre administra seleção `z/x/y`, requisições
concorrentes, cancelamento, deduplicação e cache ambiente. A mesma fonte poderá
ser usada futuramente por pacotes offline e prefetch de rotas.

### Persistência e rastreabilidade

As tabelas `chart_datasets`, `chart_ingestions` e `chart_versions` registram o
dataset, ZIP de origem, SHA-256, células e updates, edição lida do DSID, estado,
bounds, caminhos do manifesto e tiles, timestamps, erro e versão ativa. Os PBFs
e ZIPs continuam no filesystem; metadados e publicação ficam no PostgreSQL.

### Partes provisórias

- a implementação de storage é o filesystem/volume do Railway; ainda não existe
  adaptador S3/R2 nem CDN externa;
- o dispatcher de processamento é interno à API e executa um processo por job;
  ainda não existe uma fila externa;
- as migrations são aplicadas pela API na inicialização, sem uma ferramenta
  dedicada de migrations;
- o manifesto permanece como artefato no filesystem, enquanto sua localização,
  versão e estado ficam registrados no PostgreSQL;
- a política de retenção ainda não foi implementada; por isso nenhuma versão
  antiga é removida automaticamente.

## Verificação

```bash
pnpm typecheck
pnpm test
pnpm build
```
