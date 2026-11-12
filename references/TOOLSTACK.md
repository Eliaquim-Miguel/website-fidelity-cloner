# Stack, skills e ferramentas — inventário honesto

O usuário pediu “todas as skills que foram usadas”. Este arquivo distingue **skills disponíveis/consultadas como referência** de **ferramentas comprovadamente executadas**, para que uma IA no Codex ou Claude não dependa de um nome fictício, ou assuma possuir uma integração que não tem.

## Skills de clonagem no ambiente de origem

Foram identificados arquivos instalados no computador de origem:

| Skill | Local de origem no Windows | Papel / status |
| --- | --- | --- |
| website-cloner | C:\Users\Admin\.codex\skills\website-cloner\SKILL.md | Disponível; descreve clonagem de página ou seção em HTML/CSS/JS. É de terceiro e possui **licença personalizada de atribuição**. Não redistribuir seu SKILL.md dentro desta skill. |
| website-cloner-open | C:\Users\Admin\.codex\skills\website-cloner-open\SKILL.md | **Consultada durante o trabalho**; ensina extração de tokens/DOM/assets/comportamento e montagem de código editável (preferência Astro). Nosso resultado usou React/Vite em vez de Astro. |
| clone-website | C:\Users\Admin\.codex\skills\clone-website\SKILL.md | Instalado, não há evidência de execução desse runtime no caso Kirvano. Metodologia de probing e pixel benchmark útil; exige ego-browser em sua implementação específica. **Não é dependência desta skill.** |
| playwright-ui-qa | C:\Users\Admin\.codex\skills\playwright-ui-qa\SKILL.md | Instalado; não foi o executor principal do QA Kirvano. O caso usou **Chrome DevTools Protocol real** e scripts Node de QA. |
| framer-site-replica | C:\Users\Admin\.codex\skills\framer-site-replica\SKILL.md | Instalado; adequado a destino Framer, não foi usado para montar a landing React. |

Em mensagens anteriores foram mencionadas recomendações como framer-react-fidelity e framer-runtime-fidelity. A existência e execução dessas skills não foram comprovadas nesta auditoria; trate-as como **possíveis materiais externos opcionais**, e não pré-requisitos nem garantia de instalação.

**Conclusão:** o sucesso não veio de um “comando mágico”. Foi a combinação de análise com navegador real, extração controlada, engenharia de componentes, animações próprias e ciclo rigoroso de QA. Esta nova skill é **autossuficiente em instruções** e fornece scripts básicos, mesmo que nenhuma outra skill esteja instalada.

## Ferramentas realmente utilizadas no caso Kirvano → Ulls

### Navegador e inspeção

- Google Chrome/Chromium (versão registrada no QA: Chrome 157).
- DevTools e Chrome DevTools Protocol via WebSocket Node.js.
- Leitura do DOM/SSR, computed styles, getBoundingClientRect, page scroll e performance resource entries.
- Screenshots e probes em 1440×900, 768×900 e 390×844.
- Comparação geométrica e de pixels via scripts de QA. Chrome de referência e clone rodaram no mesmo ambiente.
- Navegador local: benchmark :4319, app Vite dev :4330 e build final :4318.

### Captura HTTP e dados

- Python 3: requests, html.parser, xml.etree.ElementTree, pathlib, re, json, hashlib, concurrent.futures.
- BeautifulSoup foi usado em auditoria e inspeções rápidas de HTML, mas **não** é necessário para a extração lossless por offsets.
- Extração pelo sitemap, HTML links/srcset, CSS url(), literais dos bundles, manifest de arquivos.
- SHA256 / concatenação para comprovar preservação do markup.
- Fontes Inter, Inter Tight e Fustat auto-hospedadas via CSS/fontes Google publicados; 17 WOFF2 no caso.

### Engenharia

- Node.js 24 e npm.
- React 19 + React DOM.
- Vite 7 + @vitejs/plugin-react.
- TypeScript.
- html-react-parser 5 para importar os fragmentos HTML por seção com casing de atributos preservado.
- CSS preservado do benchmark + CSS de tokens + CSS de design system + CSS de efeitos.
- IntersectionObserver, ResizeObserver quando necessário, requestAnimationFrame, Web Animations API, CustomEvent, AbortController, media queries, MutationObserver, SVG clipPath.
- JSON para catálogos copy/images/links.
- PowerShell/robocopy para separar landing e dashboard no desktop.

### QA técnico

- npm run check (tsc --noEmit) e npm run build (tsc/Vite).
- node --test para testes da lógica de gráficos; 4 testes no caso.
- Node --check para scripts .mjs.
- Chrome CDP para menu, FAQ, scroll, graph period, animação e network.
- Manifest de recursos locais e scanner de referências para evitar 404.

## O que NÃO foi necessário

- Acessar backend, banco, login ou conta interna da Kirvano.
- API de pagamento, checkout, tokens, credenciais ou bypass anti-bot.
- Copiar source maps privados ou repositório original.
- Framer como destino ou editor obrigatório.
- Instalar as skills de terceiros dentro deste pacote.
- Reaproveitar runtime React minificado como a implementação final editável.

## Requisitos portáveis

### Obrigatórios

- Python 3.10+ e biblioteca requests para o script de captura.
- Node.js 20+ e npm para React/Vite.
- Chromium/Chrome real, preferencialmente com CDP, para validação.
- Acesso público e autorizado ao site de referência.

### Opcionais

- Playwright CLI ou playwright-core para automatizar medidas e screenshots; nenhum framework de browser é obrigatório se Chrome CDP e scripts próprios estiverem disponíveis.
- BeautifulSoup4 para análises rápidas, não para serialização de HTML destinada a fidelidade.
- Sharp, Pillow ou ImageMagick para diff mais preciso de screenshots, caso estejam instalados.
- Git para rastrear alterações; recomendado fortemente.
- Ego-browser se o agente já operar nesse runtime; não misture estados/probes em runtimes diferentes ao comparar pixels.

## Como escolher a arquitetura de clone

| Referência | Benchmark recomendado | App editável recomendado |
| --- | --- | --- |
| HTML/CSS/JS estático | Copiar HTML/assets e neutralizar trackers | Astro, Vite ou HTML componentizado |
| SSR React/Vite/TanStack/Next | Espelho SSR, assets, fontes e bundle **somente no benchmark** | React/Vite ou Next com componentes próprios |
| Webflow | Export público/DOM/styles quando disponível | React ou Astro, motion recriado |
| Framer | Snapshot/medições; original WebGL ou runtime preservado apenas no benchmark | Framer nativo com skill específica, ou React para reconstrução fiel |
| Canvas/WebGL pesado | Screenshots, shader/asset inventory, gravação de movimento e probes WebGL | Canvas/WebGL próprio; não espere extração SSR automática |
| Loja, SaaS ou sistema com login | Apenas páginas públicas e ambientes autorizados | Interfaces reconstruídas; integrações próprias e mocks seguros |

## Fontes oficiais para formato/instalação

- Agent Skills: https://agentskills.io
- Codex Skills: https://learn.chatgpt.com/docs/build-skills
- Claude Code Skills: https://docs.claude.com/en/docs/claude-code/skills
- Claude Agent Skills: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview

Verifique documentação oficial quando instalar, pois paths e suporte do produto podem mudar.
