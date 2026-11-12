# Estudo de caso: Kirvano → Ulls Creators

Esta é a origem da skill. Os dados abaixo foram comprovados pelos scripts e relatórios gerados em novembro de 2026, não são promessas de resultado para novos sites.

**Não incluímos nesta skill os HTML, imagens, CSS ou fontes proprietários da Kirvano.** Os scripts técnicos do exemplo em examples/original-pipeline-scripts/ são específicos do caso. Para outro domínio, use os scripts genéricos e adapte o método.

## Fase 0 — referência e preservação

- O usuário começou com um benchmark do Softriver e mudou a referência principal para https://kirvano.com/.
- Referência Softriver mantida em reference/softriver, sem exclusão.
- Referência Kirvano preservada em reference/kirvano, separada de landing/, portal/ e ulls-landing/.
- Não se editava a referência ao personalizar a nova marca.

## Fase 1 — inspeção com navegador real

- Chrome 157/CDP, URL operacional https://www.kirvano.com/.
- Homepage de 13 seções, header, hero animado, gráfico, widgets, depoimentos, FAQ e footer.
- Resoluções 1440×900, 768×900, 390×844.
- Altura original registrada em determinada sessão: 10.037px desktop, 15.373px tablet, 16.860px mobile.
- Stack pública: React/TanStack, Vite/Tailwind, CSS bundles, mídia e fontes customizadas.
- A URL sem www apresentou restrição em uma inspeção; www foi usada. Não houve bypass.

## Fase 2 — snapshot HTTP preservado

1. mirror_kirvano.py leu sitemap.xml.
2. Capturou 18 páginas públicas HTML.
3. Varreu src/href/srcset/poster/CSS url()/strings Vite/chunks até três rodadas concorrentes.
4. Salvou 73 assets públicos same-origin.
5. vendor_kirvano_fonts.py auto-hospedou fontes Inter/Inter Tight/Fustat com 17 arquivos WOFF2.
6. build_preview.py kirvano montou preview isolado e retirou tracking apenas do preview.
7. check_mirror.py conferiu 18 HTML, 1.046 referências locais e zero faltantes.
8. QA de rede no preview: 287 requests, zero aos domínios GTM/Clarity/helper UTM verificados.
9. O vídeo Vimeo remoto retornou HTTP 401; ficou documentado como dependência externa.

## Fase 3 — comparação benchmark versus original

- Desktop: 97,96% dos pixels idênticos no quadro comparado.
- Tablet: 99,16%.
- Mobile: 98,94%.
- As alturas e geometrias principais coincidiram nos três viewports testados, dentro da tolerância subpixel adotada.

Os percentuais resultam de capturas controladas e NÃO definem uma garantia universal.

## Fase 4 — extração SSR sem reserializar

1. extract_kirvano_sections.py analisou o root SSR.
2. Identificou 20 filhos diretos, 13 sections e quatro dividers.
3. Extraiu 16 fragmentos principais: overlays, HeroShell, 13 sections, footer.
4. Cada fragmento era um slice exato do HTML original, conservando classes, SVGs, inline styles e comentários SSR.
5. A concatenação de todos os fragmentos foi validada por SHA256 contra o innerHTML original.
6. extract_kirvano_hero.py dividiu HeroShell em announcement, navigation, hero-main e fade, preservando wrapper, conteúdo e ordem.
7. Os scripts evitam sobrescrever fragmentos já editados.

## Fase 5 — app editável React/Vite

- Projeto próprio ulls-landing/, isolado do benchmark e do dashboard.
- React 19 + ReactDOM, Vite 7, TypeScript, html-react-parser.
- src/sections: um HTML por seção, mais hero e footer.
- src/components/sections.tsx: componentes nomeados e independentes.
- src/components/Markup.tsx: import.meta.glob raw, parser de HTML e overrides de conteúdo.
- src/content/copy.json, images.json, links.json: 434 trechos de texto, 39 imagens e 38 links no catálogo inicial.
- src/styles: reference.css preservado, tokens.css/design-system.css/effects separados.
- src/behavior: controladores JS ESM sem runtime React minificado de terceiro.
- Corrigiu-se casing de atributos fetchpriority para fetchPriority, preservando SVG.

## Fase 6 — recuperar comportamentos que faltavam

### Runtime independente

- Menu mobile, anchors smooth, FAQ, período do gráfico, contadores, IO reveal, cookie/help demo opt-in, CTAs externos bloqueados em demo.
- initLandingBehavior idempotente com AbortController/cleanup.

### Dashboard hero

- Sidebar/cards com entrada escalonada, labels por palavra e SVG Line.svg via clip-path.
- Navbar scroll compacta com fundo rgba(17,17,17,.72), blur14 e padding 24→12.
- Bug: labels Ticket Médio, R$197, Pix e Aprovação ficavam opacity0 após observer genérico. Marcadores data-ulls-dashboard-stage=word e status complete corrigiram.
- Sidebar convertida em mock estático a pedido do usuário, sem role/tabindex/handlers.

### Depoimentos, FAQ e plataforma

- Ticker com dois grupos, largura medida e movimento linear sem salto; pause hover/touch/focus e reduced-motion.
- FAQ aria-expanded e chevron rotate 90deg ↔ −90deg, sem listeners duplicados.
- Três cards da seção escalar com IO individual, stagger de palavras, quatro payment rows, três labels de oferta, popup comissão e seis barras animadas.
- Gráfico usa lógica de períodos 7d/30d/12m no módulo principal; effects module escuta CustomEvent, sem duplicar click.
- No mobile, sticky top 80/96/112px mantidos.

## Fase 7 — pedidos posteriores sem perder base

- Remoção intencional de três seções: ticker de marcas, Kirvano na mídia e vídeo Summit. Restaram 10 seções, sem espaços vazios.
- Cursor SVG global da Kirvano substituído pelo cursor nativo auto/pointer/text.
- Cursor fake e seleção de texto animada removidos do card de prova social; card ficou estático.
- Sidebar do hero tornada apenas visual.
- Preparação da copy para programa de creators da Ulls; a transformação textual ainda dependia de aprovação.
- Código independente copiado para C:\Users\Admin\Desktop\Ulls UGC\Landing Page, ao lado de Dashboard, com iniciador próprio. O build foi testado no novo local e exigiu remover BOM de package.json gerado no processo de cópia.

## Fase 8 — QA final

Antes dos cortes:
- 13 seções com geometria idêntica ao benchmark nos cenários testados.
- React final: 98,48% pixel parity primeira dobra desktop; 98,28% full-page desktop.
- Mobile: 92,88% primeira dobra e 93,57% full-page.
- Relatório final informou 0 warnings/exceções JS/React no fluxo.

Depois dos cortes:
- 10 seções conforme pedido do usuário; não há motivo para altura global continuar igual.
- Desktop 1440×900 e mobile 390×844: testes dos cards, ticker, FAQ, gráfico, navbar, sidebar e cursor.
- npm run test 4/4, npm run check e npm run build passaram.
- Autenticação, checkout e Pipedrive externos não foram copiados como fluxos reais.

## O que outras IAs devem replicar

**Repetir:** navegador real e prova de geometria; benchmark imutável; manifest de recursos/fontes; extração lossless com hash quando SSR permitir; React editável; design system e catálogos; módulos de motion com cleanup; QA e segurança; conteúdo próprio no rebrand.

**Não copiar cegamente:** os 13 blocos, 17 fontes, valores numéricos, URLs, classes, marca, depoimentos ou número de pixels. Todos pertencem exclusivamente ao caso usado como referência.
