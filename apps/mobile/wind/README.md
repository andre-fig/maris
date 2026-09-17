# Wind overlay (MVP)

O `WindOverlay` é uma camada transparente independente do MapLibre. O MapLibre continua desenhando o mapa-base, SOUNDG e as demais camadas ENC; o Skia desenha apenas os traços/partículas do vento acima dele.

## Dados e referência Yr

Reaproveitamos do `yr-map-docs` o modelo de campo vetorial em tiles raster, a convenção XYZ/Web Mercator e o princípio de partículas que seguem o campo. A adaptação não executa WebGL/MapLibre GL JS: `Canvas`, `Line` e `Circle` do React Native Skia fazem o desenho nativo compartilhado entre iOS e Android.

O catálogo é consultado em `https://beta.yr-maps.met.no/api/wind/available.json`. A primeira janela temporal publicada fornece um template PNG XYZ. O MET codifica os componentes em RGB: `R = eastward * 2 + 128`, `G = northward * 2 + 128`, e `B` não é usado. O decoder usa `Skia.Image.MakeImageFromEncoded` e `readPixels`, e interpola espacialmente por pixel/tile (a amostra MVP usa o pixel mais próximo; a evolução prevista é bilinear).

## Carregamento e cache

`visibleWindTiles` calcula tiles do centro/viewport (com uma margem de um tile). `WindOverlay` deduplica chamadas em voo, mantém cache de tiles decodificados e invalida o resultado de uma viewport antiga por geração. Os pedidos enviam um `User-Agent` identificável ao MET. Tiles ausentes não geram partículas inventadas.

## Rendering e sincronização

O componente recebe centro, zoom e bearing dos eventos de câmera do MapLibre. Coordenadas geográficas são projetadas para pixels da viewport e cada partícula é avançada pelos componentes east/north reais do tile. O canvas possui `pointerEvents="none"`, portanto não captura nem interfere nos gestos do mapa. Ao desabilitar o componente ou colocar o app em background, a atualização é pausada.

## Benchmark e limitações do MVP

Em build de desenvolvimento o componente registra no console, a cada 5 segundos, FPS aproximado, número de tiles e partículas. A memória aproximada é dominada pelo cache raster (até quatro tiles de 256² RGBA por viewport, cerca de 1 MiB cada). Ainda não há medição formal em um iPhone/Android neste commit.

Para manter o primeiro MVP pequeno, a animação/advecção de 180 partículas é coordenada em um loop de baixa complexidade no JS e o Skia faz a rasterização GPU. O próximo passo, antes de uma cobertura global, é mover a integração/advecção para um RuntimeEffect/SkSL ou JSI e trocar a amostra nearest-neighbour por interpolação bilinear com borda compartilhada entre tiles.
