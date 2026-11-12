# Manual de execução — do link ao app editável

Este documento reproduz a estratégia realmente executada na experiência Kirvano → Ulls Creators, generalizada para outros sites. A ordem das fases importa. Muitas “réplicas bonitas mas quebradas” ocorrem porque alguém cria os componentes antes de medir e preservar a versão original.

## Fase A — Isolamento e objetivo

1. Identifique URL pública, rotas, estado de login, plataforma-alvo e diretório de destino. Se o usuário disse apenas “clonar”, diferencie **benchmark de aparência** de **app editável**; no método completo os dois são necessários.
2. Inspecione o repositório Git, branches, arquivos não commitados e scripts de execução. Nunca apague estruturas anteriores.
3. Crie pastas separadas:

~~~text
project/
  reference/
    target/          # snapshot original, NÃO alterar durante adaptação
      index.html
      assets/
      fonts/
      snapshot-manifest.json
  editable/
    target/          # app React/Vite editável
      src/
      public/
  qa/
    baseline/
    edits/
  scripts/
~~~

4. Defina portas diferentes: referência em 4319, app em 4330, build estático em 4318 (exemplos; não fixar se ocupadas). Diga ao usuário qual preview está mostrando o quê.
5. Não inclua credenciais, cookies, perfis pessoais de navegador ou arquivos sensíveis em snapshots/relatórios.

## Fase B — Auditar o navegador ANTES de baixar

1. Abra a URL no Chrome/Chromium de teste. Teste redirecionamentos: apex, www, http→https, locale.
2. Use DevTools para descobrir: SSR ou CSR, framework, CSS bundles, script tags, fontes e requests.
3. Faça screenshots em 1440×900, 768×900 e 390×844. Mesma DPR e zoom. Registre altura total e scrollHeight, header sticky, seções, container max width, botões e imagens.
4. Vá até o fim com scroll em incrementos de 60–75% do viewport, de maneira a iniciar IntersectionObservers, carrosséis lazy e vídeos.
5. Para **cada seção**, capture: identificador original, ordem, bounding box (x/y/w/h, em coordenadas do documento), fundo, fontes, classes, imagens, animações, links, visibilidade desktop/mobile.
6. Para estados dinâmicos, repita a captura em pelo menos três momentos (início, durante, após); documente duração, easing, delays, classes e atributos alterados.
7. Descubra se cada dashboard/ilustração é uma imagem estática ou DOM com nós reais. Não reconstrua um screenshot composto em dezenas de divs se é apenas uma imagem.
8. Procure SVG inline, clipPath, masks e pseudo-elementos. Preserve viewBox, line joins, gradients e dimensões.

Exemplo de probe para colar em DevTools, Playwright evaluate ou CDP:

~~~js
(() => ({
  viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
  pageHeight: document.documentElement.scrollHeight,
  sections: [...document.querySelectorAll('main section, body > #root section, section')]
    .map((el, i) => {
      const r = el.getBoundingClientRect();
      const css = getComputedStyle(el);
      return {
        i, id: el.id, cls: String(el.className).slice(0, 160),
        x: r.x, pageY: r.y + scrollY, w: r.width, h: r.height,
        display: css.display, opacity: css.opacity,
        heading: el.querySelector('h1,h2,h3')?.textContent?.trim().slice(0, 80)
      };
    }),
  fonts: [...document.fonts].map(f => ({
    family: f.family, weight: f.weight, status: f.status
  })),
  assets: performance.getEntriesByType('resource')
    .map(x => x.name).filter(x => /\.(css|js|woff2?|png|webp|svg)(\?|$)/i.test(x))
}))()
~~~

### Importante sobre screenshot

Sem warm-up de scroll, a captura full-page pode mostrar áreas brancas: os elementos ainda estão em opacity 0 esperando IntersectionObserver. Faça primeiro o scroll sweep e somente depois a screenshot estável. Para comparar movimento, capture os dois sites no mesmo estado (ou pause CSS animation/video em ambos, explicitando essa metodologia).

## Fase C — Salvar benchmark e dependências locais

1. Prefira preservar HTML SSR recebido, com classes, SVG, style e assets originais intactos no snapshot. Seu benchmark é uma testemunha, não a versão para produção.
2. Consulte sitemap.xml, robots.txt e arquivos publicados; sitemap pode ser ausente ou incompleto. Não varra URLs privadas ou fora do escopo.
3. Extraia recursos:
   - img/src e source/srcset, loading, poster.
   - link preload/stylesheet/icons.
   - CSS url() e @font-face.
   - caminhos públicos usados pelo JS e imports dinâmicos.
   - imagens trocadas ao clicar em tabs/galerias e lazy loaded.
4. Baixe só recursos do domínio permitido ou de CDNs autorizadas; preserve paths originais relativos ao root sempre que possível.
5. Gere snapshot-manifest.json com URL, path local, tamanho, status, tipo, hash e timestamp.
6. Não trate 404 como sucesso silencioso. Liste falhas; classifique cada uma como bloqueante ou externa/dispensável.
7. Use cliente HTTP da stdlib ou requests, concorrência com limites razoáveis, timeout, validação de extensão/content-type, path traversal guard e skip cache.

Uso mínimo do script universal da skill:

~~~bash
python scripts/capture_public.py --url https://example.com/ --output ./reference/example
python scripts/verify_assets.py --root ./reference/example
python -m http.server 4319 --directory ./reference/example
~~~

O script fornecido captura uma **base HTTP**. Não presume conseguir tudo: bundles com geração dinâmica de imagens, canvas, API pública, lazy assets e sites SPA exigem completar o inventário pelo navegador. Não use a falha de um script como justificativa para pular análise.

## Fase D — Self-host das fontes reais

Fontes incorretas alteram largura de texto, quebra de linha, altura do hero e posição de todas as seções.

1. Leia CSS remoto e document.fonts, filtre fontes efetivamente utilizadas.
2. Preserve família, peso, estilo e unicode-range.
3. Baixe variantes da fonte somente quando licença permitir.
4. Publique arquivos em public/fonts e CSS @font-face local.
5. Não use fallback “parecido” sem marcar como desvio.
6. Refaça probes de H1/header antes de iniciar a implementação.

No caso Ulls/Kirvano, 17 arquivos WOFF2 foram salvos para Inter, Inter Tight e Fustat. Não presuma esse número em outros sites.

## Fase E — Remover tracking apenas no preview

Um benchmark não deve disparar pixels de publicidade nem enviar eventos de navegação ao proprietário do site:

- Revise script tags HTML e helpers remotos.
- Considere client-side head (React/TanStack/Next): JS pode reinstalar scripts removidos do SSR após hydration.
- Onde o código for de terceiro, não se baseie nele como app final. Prefira construir um preview sanitizado e o app com lógica própria.
- Teste Network após scroll/click/consentimento, não apenas na primeira carga.
- Preserve scripts do snapshot bruto **apenas se legal e seguro**; não republique artefatos de terceiro como sua aplicação.

No caso real o preview removeu snippets GTM, Microsoft Clarity e helper de UTM, sem modificar o snapshot de referência. O iframe Vimeo externo deu HTTP401; isso ficou documentado, não foi “consertado” por bypass.

## Fase F — Dividir HTML SSR por offsets

Objetivo: manter fidelidade 1:1 sem prender todas as futuras edições em um HTML enorme.

1. Analise a árvore root; não use regex ingênua para localizar fechamento de divs aninhadas.
2. Use HTMLParser com offsets/stack, ou parser com source locations que preservem bytes.
3. Extraia filhos diretos do root e identifique separadores visuais; alguns dividers são irmãos independentes, NÃO filhos da seção.
4. Crie arquivos por componente: overlays, announcement, nav, hero, 01-..., footer.
5. Faça **concatenação de slices originais**. Compare hash do innerHTML do root com hash da união das partes. O parser pode servir para delimitar, mas não serialize o DOM para gerar markup final.
6. Registre manifest com ordem e um SHA de cada arquivo.
7. Evite regenerar se alguém já editou conteúdo — fail on drift é melhor que apagar trabalho.
8. Preserve comentários de hidratação React no markup SSR quando afetarem fidelidade de texto, mas **não** injete scripts ou estados secretos.

Script genérico:

~~~bash
python scripts/split_ssr.py --html reference/example/index.html --out work/example/sections --inspect
python scripts/split_ssr.py --html reference/example/index.html --out work/example/sections --write
~~~

No exemplo real, o root tinha 20 filhos diretos, 13 sections, 4 separadores, um overlay, um HeroShell e um footer. A união dos fragmentos foi verificada com SHA256. **Isso é uma medição do caso, não uma estrutura assumida pela skill.**

## Fase G — Componentização e catálogos

1. Crie projeto React/Vite/TypeScript, mantendo o benchmark fora do source.
2. Faça componentes nomeados por função, não apenas um bloco gigante com innerHTML. Ex.: Header, Hero, Benefits, Integrations, FAQ, Footer.
3. Inicialmente os componentes podem importar HTML fragmentado via import.meta.glob(..., {query:"?raw", import:"default", eager:true}) + html-react-parser. Isto fornece **arquivos editáveis por seção**, sem compromisso definitivo com a ergonomia de JSX.
4. Para projetos maiores, migre blocos gradualmente para JSX nativo (HTML fragmentado é uma fase, não o objetivo final).
5. Crie tokens.css e components.css separados do reference.css. Edite a identidade futura nessas camadas; nunca altere arbitrariamente o original para “corrigir” divergências do clone.
6. Centralize conteúdo textual e mídia em JSON (por seção). Para nodes de texto aninhados que contêm SVG/ícones, não use textContent indiscriminadamente: apaga a estrutura.
7. Normalize atributos React incomuns, como fetchpriority→fetchPriority. Preserve SVG casing e viewBox.
8. Instale dependências no app, não no sistema global.
9. Os caminhos src/assets precisam resolver após copiar o projeto para outro diretório/PC. Não hardcode caminhos absolutos do workspace.

~~~
editable/example/
  package.json
  vite.config.ts
  src/
    App.tsx
    main.tsx
    components/{Markup.tsx,sections.tsx}
    sections/{hero.html,01-foo.html,02-bar.html,footer.html,manifest.json}
    content/{copy.json,images.json,links.json,site.ts}
    styles/{reference.css,tokens.css,components.css,motion.css}
    behavior/{index.mjs,hero.mjs,ticker.mjs,faq.mjs}
  public/{img,fonts,media}
~~~

O código real usado incluía 434 unidades de texto, 39 imagens e 38 links nos catálogos daquele site. Gere catálogos a partir do DOM **real**, não use estes valores como configuração.

## Fase H — Recriar o runtime de interação

O SSR reproduz geometria mas normalmente não traz os estados do runtime compilado. Inspecione a referência e escreva código novo.

1. Crie uma lista de cada evento e estado: mount, scroll, hover, intersection, click, foco, fechar, ticker, mídia.
2. Use IDs/data-* semânticos para marcadores de elementos. Não selecione por texto (“Kirvano”, por exemplo) porque a futura copy vai mudar.
3. Controladores devem ser idempotentes: setup(root) repetido não cria listeners duplicados. Retorne cleanup para React useEffect.
4. Use AbortController para listeners, IntersectionObserver para revelar elementos, Web Animations API só para microefeitos adicionais e requestAnimationFrame para ler/escrever frames.
5. Defina fim do estado de animação. Se SSR tem opacity:0, marque stage complete e garanta opacity:1/transform:none; reduced-motion deve entrar visível imediatamente.
6. Para elementos sticky, não transforme a altura/top nem adicione wrappers.
7. Ticker sem saltos exige duas cópias da lista e distância calculada de loop.
8. FAQ: aria-expanded e rotação CSS sincronizados. A propriedade rotate pode ser distinta de transform.
9. Gráfico: um único handler altera os dados/alturas; efeitos visualizados escutam um evento e não reescrevem a regra.
10. Não simule checkout/pagamento/autenticação como real. CTA externos de demo devem ser bloqueados ou apontar explicitamente ao projeto próprio.

Leia MOTION.md para exemplos concretos.

## Fase I — QA, diferenças e regressões

### Primeiro: a geometria

Compare nos mesmos viewports:

- Altura total do documento (tolerância pequena conforme layout).
- Número e ordem de seções; se houver cortes INTENCIONAIS, registre no relatório.
- Header/H1/container/cards: x, y, width, height.
- Overflow horizontal; fontes, posição dos ícones, quebras de texto.

### Segundo: aparência

- Screenshots da primeira dobra e da página completa em estado estável.
- Diff pixel e MAE RGB apenas como evidência complementar.
- Screenshots com hover/scroll e depois de animação completa.
- Diferencie flutuação de animações e carregamento de regressão estática.

### Terceiro: funcionalidades

- Menu desktop/mobile, FAQ open/close, ticker, carousel, graph period, animações.
- Keyboard/focus, prefers-reduced-motion, loading states e network.
- Build TypeScript, testes e preview real.

### Quarto: relatório

- Escreva QA.md com viewports, contagens, geometric deltas, pixel stats, interações, console e requests externos.
- Nunca “melhore” métricas omitindo áreas com problemas. Informe falhas Vimeo, fontes ausentes e dependências remotas.
- Repita depois de fazer rebrand. Quando usuário remove seções, novos números globais são esperados.

## Fase J — Preparar personalização e produção

1. Congele o benchmark de comparação.
2. Edite copy primeiro; depois imagens/logo; depois links/flows; somente depois componentes/arquitetura.
3. Nunca mantenha números, depoimentos, logos, claims ou links da referência como afirmações da nova marca.
4. Integre serviços próprios com contrato, schema, estados de erro e consentimento.
5. Salve um tutorial para o cliente: start dev, build, edições, backup, pastas, possíveis diferenças.
6. Entregue duas pastas: uma de dashboard/portal (se existir) e outra da landing independente, se o usuário pediu separação.

## Checklist de aceite

- [ ] Benchmark preservado e acesso local funcionando.
- [ ] Inventário do DOM, CSS, fontes, assets e seções.
- [ ] Manifesto de arquivos e validação hash.
- [ ] React/Vite (ou stack pedida) editável, sem bundle fechado como dependência principal.
- [ ] Animações, scroll, FAQ, ticker, navbar e cards funcionais.
- [ ] CSS tokens, catálogo de textos/imagens/links.
- [ ] QA desktop/tablet/mobile com evidências.
- [ ] Zero exceções JS não justificadas no fluxo testado.
- [ ] Remoção de trackers/serviços externos no preview.
- [ ] Documentação de autoria, direitos, limites e o que falta para produção.
