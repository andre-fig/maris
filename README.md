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

O código do aplicativo está em `apps/mobile`. Para regenerar o GeoJSON de
profundidades usando as células de Miami presentes em `data/ENC_ROOT`:

```bash
pnpm --filter @maris/mobile exec bash scripts/import-soundg.sh
```

## API

A API segue a organização modular do NestJS: `AppModule`, módulos de
configuração e banco, e o domínio de ingestões separado em controller, service,
modelos de domínio e adaptadores de infraestrutura. Isso mantém HTTP,
orquestração e armazenamento desacoplados para a futura inclusão da fila de
processamento.

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

## Verificação

```bash
pnpm typecheck
pnpm test
pnpm build
```
