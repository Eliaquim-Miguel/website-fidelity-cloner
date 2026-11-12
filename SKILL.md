---
name: website-fidelity-cloner
description: Capture a public website as an independently testable visual reference, reconstruct it as an editable component-based application, recreate its animations and interactions, and prove fidelity through measured browser QA. Use when the user asks to clone a website pixel-perfect, reproduce a landing page 1:1, preserve original design and motion, or turn a static/compiled site mirror into maintainable React components. Not for password-protected content, bypassing restrictions, or copying third-party services/accounts.
metadata:
  version: "1.0.0"
  authoring-language: pt-BR
  compatibility: Codex, Claude Code, Agent Skills-compatible agents
---

# Website Fidelity Cloner — referência exata + código editável

Você é uma IA de engenharia de interfaces. Sua tarefa é reproduzir com alta fidelidade uma interface pública AUTORIZADA, mas entregar **um projeto que o usuário pode editar**, não um screenshot ou somente uma captura de HTML.

**Lema do método:** observar → capturar → medir → espelhar → extrair → componentizar → reimplementar comportamento → comparar → corrigir → entregar. Não invente elementos ausentes, não confunda fidelidade com qualidade arquitetural e não declare “100% pixel-perfect” sem evidências.

## Leia antes de começar

1. Leia [references/WORKFLOW.md](references/WORKFLOW.md) — procedimento completo de ponta a ponta, com comandos.
2. Leia [references/TOOLSTACK.md](references/TOOLSTACK.md) — ferramentas reais, skills consultadas, alternativas e dependências.
3. Leia [references/QA.md](references/QA.md) — protocolo de comparação de geometrias, assets, interações e screenshots.
4. Leia [references/COMPONENTS.md](references/COMPONENTS.md) e [references/MOTION.md](references/MOTION.md) quando for converter um espelho para código editável.
5. Leia [references/TROUBLESHOOTING.md](references/TROUBLESHOOTING.md) diante de problemas de font, CSS, hidratação, vídeo, DOM, SSR ou animações.
6. Leia [references/SAFETY-AND-RIGHTS.md](references/SAFETY-AND-RIGHTS.md) antes de copiar dados, assets ou integrar funções comerciais.

## Insumos esperados

- URL pública de referência e diretório de destino.
- Escopo: página inteira, seções, ou múltiplas rotas; plataforma desejada (React/Vite por padrão).
- Permissão/legitimidade para usar ativos de terceiros e finalidade (análise local versus publicação).
- Preferências já informadas pelo usuário; **não pergunte novamente** o que foi respondido.

Se o usuário especificou URL, repositório e objetivo, comece a investigação imediatamente. Faça perguntas apenas quando houver bloqueio real, autorização ausente para uma ação externa importante ou decisões incompatíveis.

## Fases obrigatórias e gates

### 0. Preservação e inventário

- Inspecione o workspace e seu Git; não sobrescreva mudanças do usuário.
- Separe reference/<slug>/ (imutável), app/<slug>/ (editável), qa/ (evidências), scripts/.
- Faça um plano e um registro dos estados de preview.
- Para sites de terceiros, obtenha consentimento/autorizações adequadas antes de redistribuir conteúdos protegidos. Não contorne login, paywall, CAPTCHA ou bloqueios.

### 1. Reconhecimento visual e técnico

- Abra a referência em navegador real. Inspecione original nos mesmos viewports, fonte carregada e estado de scroll.
- Observe stack (React, Vite, Next, Webflow, Framer, Astro, scripts próprios), HTML SSR, classes, CSS, fontes, SVGs, imagens, vídeos, APIs públicas e estados interativos.
- Faça inventário na ordem real de header, hero, seções, dividers, overlays e footer; registre contagens e layout.
- No desktop 1440×900, tablet 768×900 e celular 390×844 (ou viewports específicos), registre bounding boxes x/y/w/h, altura total, colunas, breakpoints e computed styles.
- Percorra toda a página para disparar lazy load e IntersectionObserver. Compare estados antes e depois de animações. Não avalie efeitos animados a partir de apenas um frame.
- **Gate:** inventário de seções, recursos, fontes, estados e screenshot de referência salvo. Se site/asset inacessível, reporte e use apenas referências legitimamente disponíveis.

### 2. Benchmark de alta fidelidade (imutável)

- Salve HTML público e recursos permitidos; não dependa exclusivamente de “save page as”.
- Varra src, href, srcset, URL de CSS, imports JS e manifest/sitemap; relacione caminhos e hashes em JSON.
- Espelhe arquivos estáticos localmente, incluindo fontes reais e arquivos de CSS necessários à geometria.
- Faça preview separado do benchmark, preferencialmente sem trackers. A remoção deve acontecer em HTML **e em scripts que reinstalam tracking após hydration**.
- Não use o JavaScript de produção de terceiros para checkout, analytics, login, formulário ou API privada.
- **Gate:** recursos locais sem faltantes críticos, páginas respondendo 200 e visual renderizado no navegador.

Scripts de apoio (ajuste domínio, escopo e caminhos; não assuma que todo site tem sitemap/SSR):

~~~bash
python scripts/capture_public.py --url https://example.com --output ./reference/example
python scripts/verify_assets.py --root ./reference/example
~~~

### 3. Extração de estrutura sem perda

- Se o HTML SSR for utilizável, divida por **offsets do HTML de origem**, sem reserializar SVG, entidades, atributos, CSS inline ou texto.
- Conserve ordem de irmãos, separadores, overlays, banner, navegação, hero e footer.
- Guarde manifest.json com ID, classes, arquivo, posição, hash de origem e ordem de render.
- Verifique por concatenação/hash que a união dos fragments equivale ao conteúdo extraído. Scripts de analytics não entram.
- Se o site for puramente client-side/canvas/WebGL, faça reconstrução semântica por componentes e comportamentos a partir das medições; não force a extração SSR.
- **Gate:** inventário e teste de cobertura do DOM, nenhum container/divisor perdido.

~~~bash
python scripts/split_ssr.py --html ./reference/example/index.html --out ./work/example/sections --inspect
python scripts/split_ssr.py --html ./reference/example/index.html --out ./work/example/sections --write
~~~

### 4. Componentização realmente editável

- Crie fonte React/Vite (padrão) ou stack pedida pelo usuário; não entregue somente bundle JS minificado.
- Exponha Header, Announcement, Hero, cada Section, Footer, Overlay como unidades próprias.
- Mantenha tokens globais de design e CSS de referência isolados; depois substitua progressivamente por CSS/componentes mantidos pela equipe.
- Centralize copy, imagens, links e metadados; preserve valores originais para diffs. Alterações de conteúdo não devem destrutivamente reescrever HTML complexo.
- Sem wrappers DOM adicionais que alterem flex/grid/posicionamento. Preserve classes/IDs/atributos críticos.
- Copie apenas fontes/mídia/CSS autorizados para public; **não** copie bundles React proprietários como lógica final do app.
- **Gate:** app compila e se parece com benchmark ANTES de receber nova marca.

### 5. Restaure interações com código próprio

- Inventarie: navbar scroll/blur, menu mobile, FAQ, carrossel/ticker, sticky/parallax, gráficos, contador, cursor, hover, drawers, cookies, entradas escalonadas e funcionalidades de cada CTA.
- Escreva módulos independentes setupX(root=document) que retornam cleanup; use markers data-* estáveis, listeners com AbortController, IntersectionObserver, requestAnimationFrame e matchMedia quando adequados.
- Não duplique handlers. Separe regra de negócio (ex. período de gráfico) de efeitos de apresentação (escala das barras).
- Elementos SSR com opacity:0/transform inicial precisam de estados de conclusão explícitos. Configure prefers-reduced-motion.
- Faça mock seguro de ações que dependem de backend, sem afirmar que dado foi enviado ou pagamento concluído.
- **Gate:** controles visíveis funcionam, controle de foco/teclado adequado, sem logs de exceção e sem conteúdo permanentemente invisível.

### 6. QA comparativo com a referência

- Rode benchmark e app no mesmo Chrome e resoluções. Mesmos fonts, dpr, zoom, viewport, cookies e estados de animação.
- Compare primeiro geométrico (section count, altura, H1/header, x/y/w/h), depois screenshots e efeitos.
- Teste desktop, tablet, mobile, scroll, interações, console, rede, assets, links, overflow e reduced motion.
- Reteste após mudanças de copy ou remoção de seções; não confunda diferenças intencionais com regressões.
- **Gate:** relatório com números REAIS e desvios residuais; não invente métrica.

### 7. Entrega

- Documente arquitetura, comandos de execução e locais de edição.
- Deixe benchmark intacto, app editável em pasta separada e scripts reproduzíveis.
- Não publique, conecte serviços, envie mensagens ou altere credenciais sem autorização aplicável.
- Entregue links/paths verificados e explique limites (integrações externas, copyright, dados dinâmicos).
- Para rebrand, **aprove primeiro a estrutura fiel**, depois troque textos/imagens, depois revise animações e integrações.

## Regras invioláveis

- Não edite nem apague o benchmark sem ordem explícita do usuário.
- Não substitua medições por “parece igual”; inspecione DOM real e computed styles.
- Não faça animação fake se a referência tem timing e estados reais mensuráveis.
- Não reescreva SVG bruto sem necessidade; preserve viewBox e atributos.
- Não copie autenticação, checkout real, tokens, sessões privadas, analytics de terceiros ou dados pessoais.
- Não inclua assets de um site de terceiros no repositório público da skill.
- Não prometa cópia perfeita independente do site: WebGL, DRM, autenticação, iframes externos e conteúdo dinâmico podem exigir reconstrução manual ou ficar indisponíveis.
- Não use conteúdo comercial da referência como afirmação da nova marca.

## Formato do relatório final

Informe: pasta de benchmark, pasta do app, arquivos principais, mudanças, testes executados e seus resultados, diferenças conhecidas, como editar copy/imagens/estilos, como abrir previews, o que falta para produção. Se houver erro, não alegue conclusão.

## Exemplo real que originou a skill

Leia [examples/ULLS-KIRVANO.md](examples/ULLS-KIRVANO.md). Este é um **caso auditado**, não um template de domínio. Valores/volumes e screenshots desse caso não são garantias para outros sites.
