import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Anchor, ArrowRight, Check, CloudRain, Compass, Download, Gauge,
  Globe2, Layers3, Map, Menu, Moon, Navigation, Route as RouteIcon,
  ShieldCheck, Smartphone, Sun, Waves, Wind, X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import chartDay from "@/assets/maris-chart-day.jpg";
import chartNight from "@/assets/maris-chart-night.jpg";
import sailing from "@/assets/maris-sailing.jpg";
import logoAsset from "@/assets/logo_lockup.png.asset.json";
import appIconAsset from "@/assets/app_icon.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MARIS — Navegação náutica com confiança" },
      { name: "description", content: "Cartas náuticas oficiais, meteorologia em tempo real, rotas inteligentes e ferramentas de navegação marítima em um só app." },
      { property: "og:title", content: "MARIS — Navegue com confiança" },
      { property: "og:description", content: "A experiência moderna para cartas náuticas, clima e planejamento de rotas." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: MarisPage,
});

const featureTabs = [
  { id: "chart", label: "Carta oficial", icon: Map, copy: "Cartografia ENC precisa, com sondagens, canais, perigos e auxílios à navegação." },
  { id: "wind", label: "Vento", icon: Wind, copy: "Vetores de vento dinâmicos integrados diretamente à sua rota." },
  { id: "rain", label: "Precipitação", icon: CloudRain, copy: "Radar e precipitação para antecipar mudanças durante a travessia." },
  { id: "depth", label: "Profundidade", icon: Waves, copy: "Batimetria clara, contornos de segurança e águas rasas em destaque." },
  { id: "night", label: "Modo noturno", icon: Moon, copy: "Contraste otimizado para preservar a visão noturna e reduzir a fadiga." },
];

const features = [
  { icon: Map, title: "Cartas náuticas oficiais", text: "Dados ENC oficiais, sondagens, canais, perigos, naufrágios, faróis e auxílios à navegação." },
  { icon: RouteIcon, title: "Rotas marítimas inteligentes", text: "Planejamento considerando calado, profundidade, restrições, waypoints e condições meteorológicas." },
  { icon: Compass, title: "GPS e bússola em tempo real", text: "SOG, COG, heading e orientação North Up ou Course Up com leitura imediata e precisa." },
  { icon: Wind, title: "Clima e vento animado", text: "Vento, precipitação, pressão barométrica, ondas e marés, juntos no mesmo contexto." },
  { icon: Waves, title: "Profundidade e segurança", text: "Diferenciação visual de águas rasas, alertas de calado e isolinhas batimétricas." },
  { icon: Download, title: "Navegação offline-first", text: "Baixe regiões inteiras e navegue com autonomia mesmo longe de qualquer sinal celular." },
  { icon: Gauge, title: "Viagens e análises", text: "Rotas gravadas, estatísticas, histórico, distância, bearing e coordenadas em DMS ou DD." },
];

const faq = [
  ["As cartas do MARIS são oficiais?", "Sim. O MARIS utiliza dados de cartas eletrônicas náuticas oficiais (ENC), organizados em uma experiência móvel clara e moderna."],
  ["O aplicativo funciona sem internet?", "Sim. Você pode baixar previamente regiões completas, incluindo cartas e dados essenciais, para navegar sem conexão celular."],
  ["O MARIS substitui os equipamentos de bordo?", "Não. O MARIS é uma ferramenta auxiliar de planejamento e navegação. Mantenha equipamentos homologados, cartas adequadas e julgamento náutico responsável."],
  ["Como a rota considera o meu barco?", "Você informa parâmetros como calado e preferências. O planejamento avalia profundidades, restrições conhecidas e contexto meteorológico disponível."],
  ["Quais regiões estão disponíveis?", "O lançamento começa nas águas dos Estados Unidos. Novas regiões serão incorporadas continuamente por meio de convênios hidrográficos internacionais."],
  ["O MARIS está disponível para iPhone e Android?", "Sim. O MARIS foi desenhado para iOS e Android, com a mesma experiência de alta qualidade nas duas plataformas."],
];

function StoreButtons({ compact = false }: { compact?: boolean }) {
  return <div className={`flex ${compact ? "flex-col" : "flex-col sm:flex-row"} gap-3`}>
    {[{ top: "Baixar na", name: "App Store", icon: Smartphone }, { top: "DISPONÍVEL NO", name: "Google Play", icon: Navigation }].map((store) => (
      <Button key={store.name} className="h-14 justify-start rounded-xl bg-foreground px-5 text-background hover:bg-foreground/90">
        <store.icon className="size-6" />
        <span className="text-left leading-none"><small className="block text-[9px] font-normal uppercase opacity-70">{store.top}</small><strong className="mt-1 block text-base">{store.name}</strong></span>
      </Button>
    ))}
  </div>;
}

function Phone({ night = false, className = "" }: { night?: boolean; className?: string }) {
  return <div className={`phone-shell relative mx-auto w-[280px] overflow-hidden rounded-[3.2rem] border-[7px] border-phone bg-phone p-1 shadow-phone sm:w-[310px] ${className}`}>
    <div className="absolute left-1/2 top-3 z-30 h-6 w-24 -translate-x-1/2 rounded-full bg-phone" />
    <div className="relative aspect-[9/19.5] overflow-hidden rounded-[2.65rem] bg-muted">
      <img src={night ? chartNight : chartDay} alt={`Carta náutica MARIS em modo ${night ? "noturno" : "diurno"}`} width={1024} height={1536} className="h-full w-full object-cover transition-all duration-700" />
      <div className="absolute inset-x-3 top-12 z-20 grid grid-cols-3 gap-1.5 rounded-2xl border border-overlay/20 bg-overlay/85 p-2 text-center text-[9px] text-overlay-foreground shadow-soft backdrop-blur-xl">
        <span><b className="block text-sm">12.4</b>SOG kts</span><span><b className="block text-sm">214°</b>COG</span><span><b className="block text-sm">18.2</b>Depth m</span>
        <span><b className="block text-sm">14</b>Wind NE</span><span><b className="block text-sm">16:45</b>ETA</span><span><b className="block text-sm">2.3</b>Next nm</span>
      </div>
      <img src={appIconAsset.url} alt="" aria-hidden="true" width={36} height={36} className="absolute bottom-4 left-4 z-20 size-9 rounded-[9px] border border-overlay/30 shadow-soft" />
      <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-route px-4 py-2 text-xs font-semibold text-route-foreground shadow-lg"><span className="size-2 animate-pulse rounded-full bg-safety" /> GPS fix</div>
    </div>
  </div>;
}

function DownloadDialog({ children }: { children: React.ReactNode }) {
  return <Dialog><DialogTrigger asChild>{children}</DialogTrigger><DialogContent className="max-w-md rounded-3xl p-8">
    <DialogHeader className="items-center text-center">
      <img src={appIconAsset.url} alt="Ícone do aplicativo MARIS" width={96} height={96} className="mb-4 size-24 rounded-[22px] shadow-soft" />
      <DialogTitle className="text-2xl">Leve o MARIS a bordo.</DialogTitle>
      <DialogDescription className="max-w-xs">Escolha sua plataforma para baixar o aplicativo.</DialogDescription>
    </DialogHeader><div className="mx-auto mt-3"><StoreButtons compact /></div>
  </DialogContent></Dialog>;
}

function MarisPage() {
  const [dark, setDark] = useState(false);
  const [menu, setMenu] = useState(false);
  const [tab, setTab] = useState("chart");
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);
  const previewNight = tab === "night" || dark;

  return <main className="overflow-hidden bg-background text-foreground">
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
        <a href="#top" aria-label="MARIS — início"><img src={logoAsset.url} alt="MARIS" width={112} height={42} className="h-10 w-auto object-contain dark:brightness-0 dark:invert" /></a>
        <nav aria-label="Navegação principal" className="hidden items-center gap-7 text-sm font-medium md:flex">
          {[['Features','#features'],['Navigation','#navigation'],['Weather','#navigation'],['Coverage','#coverage'],['FAQ','#faq']].map(([x,h])=><a key={x} href={h} className="text-muted-foreground transition-colors hover:text-foreground">{x}</a>)}
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={()=>setDark(!dark)} aria-label={dark ? "Ativar modo diurno" : "Ativar modo noturno"}>{dark ? <Sun/> : <Moon/>}</Button>
          <DownloadDialog><Button className="hidden rounded-full px-5 sm:inline-flex">Download</Button></DownloadDialog>
          <Button variant="ghost" size="icon" className="md:hidden" onClick={()=>setMenu(!menu)} aria-label="Abrir menu">{menu ? <X/> : <Menu/>}</Button>
        </div>
      </div>
      {menu && <nav className="border-t border-border bg-background p-5 md:hidden">{[['Features','#features'],['Navigation','#navigation'],['Weather','#navigation'],['Coverage','#coverage'],['FAQ','#faq']].map(([x,h])=><a key={x} href={h} onClick={()=>setMenu(false)} className="block py-3 text-lg">{x}</a>)}</nav>}
    </header>

    <section id="top" className="relative min-h-[900px] bg-hero pt-28 lg:min-h-[840px]">
      <div className="mx-auto grid max-w-7xl items-center gap-16 px-5 pb-20 lg:grid-cols-[1.05fr_.95fr] lg:px-8">
        <div className="relative z-10 pt-8 lg:pt-0">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-background/70 px-4 py-2 text-xs font-semibold text-primary shadow-soft backdrop-blur"><ShieldCheck className="size-4"/> Official Electronic Nautical Charts <span className="text-border">•</span> iOS & Android</div>
          <h1 className="max-w-3xl text-5xl font-semibold leading-[.98] tracking-normal sm:text-7xl lg:text-[5.4rem]">Navigate with <span className="text-primary">confidence.</span></h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl">Official nautical charts, real-time weather, intelligent routing and essential marine navigation tools — all in one beautifully designed app.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <DownloadDialog><Button size="lg" className="h-12 rounded-full px-6">Download MARIS <Download/></Button></DownloadDialog>
            <Button asChild variant="outline" size="lg" className="h-12 rounded-full px-6"><a href="#features">Explore features <ArrowRight/></a></Button>
          </div>
          <div className="mt-12 flex items-center gap-4"><img src={appIconAsset.url} alt="Ícone MARIS" width={52} height={52} className="size-13 rounded-xl shadow-soft"/><p className="text-sm text-muted-foreground"><strong className="block text-foreground">Precisão em cada milha.</strong>Projetado para quem realmente navega.</p></div>
        </div>
        <div className="relative flex min-h-[620px] items-center justify-center lg:min-h-[700px]">
          <div className="absolute h-[72%] w-[92%] rounded-[50%] bg-primary/10 blur-3xl" />
          <Phone night={dark} className="relative z-10 rotate-[4deg] transition-transform duration-700 hover:rotate-0" />
          <div className="absolute left-0 top-24 hidden rounded-2xl border border-overlay/60 bg-overlay/85 p-4 text-sm text-overlay-foreground shadow-float backdrop-blur-xl sm:block"><span className="text-xs text-muted-foreground">Route status</span><b className="mt-1 flex items-center gap-2"><Check className="size-4 text-safety"/> Safe passage</b></div>
          <div className="absolute bottom-24 right-0 hidden rounded-2xl border border-overlay/60 bg-overlay/85 p-4 text-sm text-overlay-foreground shadow-float backdrop-blur-xl sm:block"><span className="text-xs text-muted-foreground">Wind at position</span><b className="mt-1 flex items-center gap-2"><Wind className="size-4 text-primary"/> 14 kts · NE</b></div>
        </div>
      </div>
    </section>

    <section id="navigation" className="bg-deep py-24 text-deep-foreground sm:py-32">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="mx-auto max-w-2xl text-center"><p className="eyebrow">LIVE NAVIGATION</p><h2 className="mt-4 text-4xl font-semibold sm:text-6xl">Every layer. One clear view.</h2><p className="mt-5 text-lg text-deep-muted">Explore a navegação exatamente como ela deve ser: contextual, fluida e sob seu controle.</p></div>
        <div className="mt-14 grid items-center gap-12 lg:grid-cols-[.75fr_1.25fr]">
          <div role="tablist" aria-label="Camadas da carta" className="space-y-2">{featureTabs.map((item)=><button key={item.id} role="tab" aria-selected={tab===item.id} onClick={()=>setTab(item.id)} className={`group flex w-full items-start gap-4 rounded-xl border p-4 text-left transition-all ${tab===item.id?'border-deep-accent bg-deep-panel':'border-transparent hover:bg-deep-panel/60'}`}><span className={`mt-0.5 rounded-lg p-2 ${tab===item.id?'bg-deep-accent text-deep':'bg-deep-panel text-deep-muted'}`}><item.icon className="size-5"/></span><span><b className="block">{item.label}</b><small className={`mt-1 block leading-relaxed ${tab===item.id?'text-deep-muted':'hidden'}`}>{item.copy}</small></span></button>)}</div>
          <div className="relative flex min-h-[650px] items-center justify-center overflow-hidden rounded-[2rem] border border-deep-border bg-deep-panel">
            <Phone night={previewNight} />
            {tab==='wind' && <div className="pointer-events-none absolute inset-0 opacity-70 wind-lines"/>}
            {tab==='rain' && <div className="pointer-events-none absolute right-10 top-20 h-56 w-56 rounded-full bg-radar blur-2xl"/>}
            {tab==='depth' && <div className="absolute bottom-8 left-8 right-8 rounded-xl border border-deep-border bg-deep/80 p-4 text-sm backdrop-blur"><div className="mb-2 flex justify-between"><span>Safety contour</span><b>5.0 m</b></div><div className="h-2 rounded-full bg-depth-gradient"/></div>}
          </div>
        </div>
      </div>
    </section>

    <section id="features" className="py-24 sm:py-32"><div className="mx-auto max-w-7xl px-5 lg:px-8">
      <p className="eyebrow text-center">ESSENTIAL TOOLS</p><h2 className="mx-auto mt-4 max-w-3xl text-center text-4xl font-semibold sm:text-6xl">Everything you need.<br/>Nothing you don’t.</h2>
      <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">{features.map((f,i)=><article key={f.title} className={`group bg-card p-7 transition-colors hover:bg-accent/40 ${i===6?'lg:col-span-3':''}`}><f.icon className="size-7 text-primary"/><h3 className="mt-8 text-xl font-semibold">{f.title}</h3><p className="mt-3 leading-relaxed text-muted-foreground">{f.text}</p></article>)}</div>
    </div></section>

    <section className="bg-muted/50 py-24 sm:py-32"><div className="mx-auto max-w-7xl px-5 lg:px-8"><div className="grid gap-16 lg:grid-cols-2 lg:items-center">
      <div><p className="eyebrow">BUILT DIFFERENTLY</p><h2 className="mt-4 text-4xl font-semibold sm:text-6xl">A modern standard for marine navigation.</h2><p className="mt-6 text-lg leading-relaxed text-muted-foreground">Sem interfaces legadas. Sem alternar entre cinco aplicativos. Apenas as informações certas, no momento certo.</p><div className="mt-10 space-y-4">{['Experiência mobile-first, clara e intuitiva','Dados hidrográficos oficiais','Clima integrado nativamente à rota','Renderização vetorial rápida e fluida','Uma experiência única e conectada'].map(x=><div key={x} className="flex items-center gap-3"><span className="rounded-full bg-primary/10 p-1 text-primary"><Check className="size-4"/></span><span className="font-medium">{x}</span></div>)}</div></div>
      <blockquote className="rounded-3xl bg-primary p-9 text-primary-foreground shadow-float sm:p-12"><Anchor className="size-9 opacity-70"/><p className="mt-8 text-2xl font-medium leading-snug sm:text-3xl">“MARIS brings together the tools boaters normally need across multiple apps into one navigation experience.”</p></blockquote>
    </div></div></section>

    <section className="py-24 sm:py-32"><div className="mx-auto max-w-7xl px-5 lg:px-8"><div className="relative min-h-[620px] overflow-hidden rounded-[2rem] bg-deep">
      <img src={sailing} alt="Veleiro moderno navegando em águas costeiras" width={1600} height={912} loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-70"/><div className="absolute inset-0 bg-photo-shade"/>
      <div className="relative z-10 flex min-h-[620px] max-w-2xl flex-col justify-end p-8 text-deep-foreground sm:p-14"><p className="eyebrow text-deep-accent">BUILT FOR REAL NAVIGATION</p><h2 className="mt-4 text-4xl font-semibold sm:text-6xl">Made for the water.</h2><p className="mt-5 text-lg leading-relaxed text-deep-muted">Para velejadores, navegadores recreativos, lanchas, pesca esportiva, cruzeiros costeiros e planejamento offshore.</p><div className="mt-8 flex flex-wrap gap-2">{['Sailing','Motorboats','Sport fishing','Coastal','Cruising','Offshore'].map(x=><span key={x} className="rounded-full border border-deep-border bg-deep/40 px-4 py-2 text-sm backdrop-blur">{x}</span>)}</div></div>
    </div><p className="mx-auto mt-6 max-w-4xl text-center text-xs leading-relaxed text-muted-foreground">O MARIS é uma ferramenta auxiliar de navegação. Não substitui cartas oficiais atualizadas, equipamentos homologados, avisos aos navegantes ou o julgamento responsável do comandante.</p></div></section>

    <section id="coverage" className="bg-deep py-24 text-deep-foreground sm:py-32"><div className="mx-auto max-w-7xl px-5 text-center lg:px-8"><p className="eyebrow text-deep-accent">GROWING GLOBAL COVERAGE</p><h2 className="mt-4 text-4xl font-semibold sm:text-6xl">From US waters to the world.</h2><p className="mx-auto mt-5 max-w-2xl text-lg text-deep-muted">Lançamento focado nas águas dos Estados Unidos, com expansão contínua por meio de convênios hidrográficos internacionais.</p>
      <div className="relative mx-auto mt-14 aspect-[2/1] max-w-5xl overflow-hidden rounded-3xl border border-deep-border bg-map p-5"><Globe2 className="absolute left-1/2 top-1/2 h-[82%] w-[82%] -translate-x-1/2 -translate-y-1/2 text-deep-border" strokeWidth={.45}/><div className="absolute left-[23%] top-[38%] flex items-center gap-2 rounded-full border border-deep-accent/40 bg-deep/80 px-3 py-2 text-xs shadow-glow backdrop-blur"><span className="size-2 animate-pulse rounded-full bg-deep-accent"/> United States · Live</div><div className="absolute bottom-6 right-6 text-xs text-deep-muted">Coverage expands continuously</div></div>
    </div></section>

    <section id="faq" className="py-24 sm:py-32"><div className="mx-auto max-w-3xl px-5"><p className="eyebrow text-center">FAQ</p><h2 className="mt-4 text-center text-4xl font-semibold sm:text-6xl">Questions, answered.</h2><Accordion type="single" collapsible className="mt-14">{faq.map(([q,a],i)=><AccordionItem key={q} value={`q-${i}`}><AccordionTrigger className="py-6 text-base hover:no-underline sm:text-lg">{q}</AccordionTrigger><AccordionContent className="pb-6 leading-relaxed text-muted-foreground">{a}</AccordionContent></AccordionItem>)}</Accordion></div></section>

    <section className="px-5 pb-10"><div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-primary px-6 py-16 text-center text-primary-foreground sm:px-12 sm:py-20"><img src={appIconAsset.url} alt="Ícone do aplicativo MARIS" width={88} height={88} loading="lazy" className="mx-auto size-20 rounded-[20px] border border-primary-foreground/20 shadow-float"/><h2 className="mx-auto mt-7 max-w-3xl text-4xl font-semibold sm:text-6xl">Take MARIS with you.</h2><p className="mt-4 text-xl text-primary-foreground/75">One app. Your charts. Your weather. Your route.</p><div className="mt-9 flex justify-center"><StoreButtons/></div></div></section>

    <footer className="border-t border-border py-14"><div className="mx-auto max-w-7xl px-5 lg:px-8"><div className="grid gap-12 md:grid-cols-[1.5fr_1fr_1fr_1fr]"><div><img src={logoAsset.url} alt="MARIS" width={120} height={48} loading="lazy" className="h-12 w-auto object-contain dark:brightness-0 dark:invert"/><p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">Modern marine navigation, designed for confidence on the water.</p></div>{[['Product','Features','Navigation','Weather'],['Company','Coverage','Safety','Contact'],['Legal','Privacy','Terms','Chart sources']].map(([title,...links])=><div key={title}><b className="text-sm">{title}</b>{links.map(x=><a key={x} href="#" className="mt-3 block text-sm text-muted-foreground hover:text-foreground">{x}</a>)}</div>)}</div><div className="mt-14 flex flex-col justify-between gap-4 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row"><p>© 2026 MARIS. All rights reserved.</p><p>Navigate responsibly. Always maintain a proper lookout.</p></div></div></footer>
  </main>;
}