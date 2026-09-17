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
- GDAL/OGR para regenerar o exemplo `SOUNDG`

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
O ZIP original e um `manifest.json` são armazenados em
`apps/api/.storage/ingestions/<id>` por padrão.

Para consultar o manifesto:

```bash
curl --fail-with-body \
  http://localhost:3001/ingestions/<id>
```

Esta primeira rota encerra no estado `received`. A aplicação de updates S-57,
normalização via GDAL e publicação cartográfica serão etapas assíncronas do
pipeline, sem executar processamento pesado dentro da requisição HTTP.

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

Para processar e publicar uma versão imutável a partir das células S-57 locais:

```bash
bash apps/api/scripts/import-soundg.sh miami-soundg-v3
```

O GeoJSON é intermediário e temporário. O script aplica os updates S-57 com o
GDAL e chama `build-soundg-tiles.ts`, que materializa os PBFs antes de trocar o
ponteiro `active.json`. Se a pasta da versão já existir, a geração falha em vez
de sobrescrever artefatos publicados.

O storage local/Railway tem esta estrutura:

```text
.storage/chart-data/
  soundg/
    active.json
    versions/
      miami-soundg-v1/
        manifest.json
        {z}/{x}/{y}.pbf
      miami-soundg-v2/
        manifest.json
        {z}/{x}/{y}.pbf
```

Publicar uma versão altera somente `active.json`. As versões anteriores ficam
intactas para rollback e clientes offline; nenhuma versão é apagada pelo deploy.
No Railway, `.storage/chart-data` está no volume persistente, separado da imagem
Docker. Em produção, o Nginx lê os PBFs diretamente desse volume. As requisições
de tiles não chegam ao processo NestJS.

O NestJS lê somente `active.json` e o pequeno `manifest.json` para responder:

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

Para gerar MVT a partir de um GeoJSON normalizado já existente, sem executar o
GDAL novamente:

```bash
pnpm --filter @maris/api build:tiles -- \
  --input /caminho/soundg.json \
  --storage-dir ../../.storage/chart-data \
  --version miami-soundg-v3 \
  --publish
```

No mobile, a `VectorSource` do MapLibre administra seleção `z/x/y`, requisições
concorrentes, cancelamento, deduplicação e cache ambiente. A mesma fonte poderá
ser usada futuramente por pacotes offline e prefetch de rotas.

### Partes provisórias

- a implementação de storage é o filesystem/volume do Railway; ainda não existe
  adaptador S3/R2 nem CDN externa;
- o processamento é disparado por script, fora da requisição HTTP; a ingestão
  por upload ainda termina no estado `received`;
- `active.json` e os manifestos ainda são arquivos, não registros de catálogo
  no PostgreSQL;
- a política de retenção ainda não foi implementada; por isso nenhuma versão
  antiga é removida automaticamente.

## Verificação

```bash
pnpm typecheck
pnpm test
pnpm build
```
