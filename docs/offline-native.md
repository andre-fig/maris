# Mapa-base + ENC offline

## Comportamento

O gerenciamento é automático, sem painel, botão ou ação nova no ícone de mapa.
Após 1,5 s de viewport estabilizada, em zoom 10–16, o app prepara os pacotes
nativos para os bounds visíveis + 15% de margem. Só prepara áreas que intersectam
a cobertura ENC atual. Não baixa o país nem inclui vento/clima. O download não
muda o centro, o zoom ou a simbologia. O GPS continua sendo o centro inicial;
sem uma posição disponível, é possível abrir o centro da última área persistida,
sem fabricar um marcador GPS.

`use-automatic-offline.ts` coordena a viewport; `offline-engine.ts` coordena
revisões; `offline-areas.ts` adapta filesystem e `OfflineManager` do MapLibre.
O hook mantém progresso/erro internos, sem exibição adicional conforme solicitado.

## Recursos e armazenamento

Cada revisão tem dois `OfflinePack`: base e ENC. Os snapshots locais congelam o
style, catálogos e URLs de tiles (inclusive a revisão do planeta OpenFreeMap).
O style ENC declara SOUNDG e Noto Sans Regular para que o downloader nativo inclua
os glyphs. O MapLibre baixa tiles, sprites, glyphs e styles; JavaScript não baixa
tiles. Na renderização, o style-base é inline e a fonte ENC recebe URLs
versionadas inline, sem consultar TileJSON remoto para reabrir offline.

- Android: banco privado `files/mbgl-offline.db`.
- iOS: `Library/Application Support/<bundle-id>/.mapbox/cache.db` do MapLibre.
- Metadata e styles: `Paths.document/offline-areas` nos dois sistemas.
- Android não aceita `file://` no downloader HTTP: `native-offline` intercepta
  apenas `https://offline.maris.invalid/<id>.style.json`, lendo o arquivo privado.
  Esse domínio reservado nunca é consultado na rede. As demais requisições seguem
  o HTTP nativo normal. iOS usa diretamente a URL local do style.

Os recursos associados aos packs são protegidos pelas referências nativas
`region_tiles`/`region_resources`, não pelo cache ambiente. A desinstalação ou
limpeza dos dados do aplicativo obviamente remove também os packs.

## Versionamento, falhas e remoção

Revisões têm IDs próprios e journal append-only publicado por rename, armazenando
bounds, faixa de zoom, tamanho informado pelo SDK, versão/TileJSON ENC, style,
IDs dos packs, timestamps e erros. `ready` é publicado somente após os DOIS packs
estarem completos. O app escolhe a última revisão `ready` por área.

A versão ENC é consultada a cada 10 minutos enquanto há viewport elegível e app
ativo. Uma revisão nova é baixada separadamente; erros não alteram a anterior.
Downloads interrompidos são reconciliados ao reabrir: dois packs completos podem
ser publicados; incompletos ficam `failed`, sem substituir o último `ready`.
Tentativas após falha aguardam pelo menos 60 segundos. Staging com falha é
descartado na próxima tentativa; versões publicadas anteriores são mantidas.

`OfflineAreas.remove(areaId)` remove todos os packs e styles daquela área.
Depois limpa o cache ambiente nativo, porque `deletePack` apenas retirar as
referências pode deixar bytes no cache descartável. Isso também limpa outros
recursos **descartáveis**, mas não remove recursos protegidos por outros packs.
A operação existe no serviço, sem UI de remoção nesta implementação automática.

## Limites

- Cache ambiente: 256 MiB, separado dos packs.
- Packs: orçamento conservador de 512 MiB somando tamanhos reportados pelo SDK,
  inclusive versões anteriores; recursos compartilhados podem ser contados duas vezes.
- Reserva de disco: 128 MiB; máximo de 5 áreas lógicas.
- Um download por vez; sem progresso por 60 s resulta em falha preservando a revisão ativa.
- Orçamento é conferido por progresso, não um limite rígido por byte: downloads
  em voo e overhead SQLite/journal podem ultrapassá-lo ligeiramente.
- Ao atingir o limite, para de preparar novas áreas; não expulsa packs garantidos.
- Garantia somente após conclusão, nos bounds e zooms baixados. Fora deles,
  cobertura depende da rede/cache. Não há indicação visual adicional.

## Validação (17/09/2026)

- Android emulador: download real de Miami, zoom 10–16, 25.148.175 bytes reportados.
- Build Release com JS embarcado: force-stop, Wi-Fi=0 e mobile_data=0,
  sem reverse do Metro, reabertura e pan: mapa-base, labels/sprites e SOUNDG visíveis.
- Limpeza real via `OfflineManager.clearAmbientCache`: 74 tiles e 3 recursos
  sem vínculo offline passaram a zero; 98 vínculos de tiles e 526 de recursos
  offline foram preservados. Nova reabertura sem rede continuou renderizando.
- Fixture `offline-native-validation.ts`, executada somente no build de teste:
  TileJSON de v2 sintético apontando aos PBF NOAA reais com URL distinta; os packs
  antigos permaneceram completos. v3 com conexão indisponível falhou e preservou
  v2. Remoção eliminou todos os packs da área de teste. Não foi publicada uma
  edição fictícia no backend nem alterado o pipeline ENC.
  Após remoção + limpeza dos recursos descartáveis, o banco passou de
  20.115.456 para 65.536 bytes, sem tiles/recursos offline restantes nessa fixture.
- iOS simulador: build Release e download nativo real concluídos, 25.271.458 bytes.
  Reabertura com rede fisicamente desligada no iPhone ainda não validada.
- Testes automatizados cobrem publicação conjunta, recuperação, atualização,
  falha, orçamento, remoção e snapshots imutáveis. Não substituem o teste físico.

Não há CDNs novos, alteração do pipeline ENC, novo servidor de tiles ou UI offline.
