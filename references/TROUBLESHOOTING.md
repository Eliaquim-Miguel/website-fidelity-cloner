# Falhas reais encontradas e como diagnosticar

Este catálogo documenta problemas observados durante Kirvano → Ulls Creators e correções aplicadas. É um inventário de causas, não apenas sintomas.

## 1. Domínio apex falha; www abre

**Sintoma:** endereço sem www falha e https://www.dominio.com/ funciona.

**Causa possível:** WAF/CDN, redirecionamento, cookies, locale ou políticas de acesso.

**Ação:** audite a URL pública realmente acessível e documente redirects. Não burle proteção.

## 2. Fonte diferente gera layout deslocado

**Sintoma:** H1 quebra em mais linhas e seções mudam de posição.

**Causa:** font fallback, peso/unicode-range incorreto, fonte remota bloqueada.

**Correção:** inspecione document.fonts/@font-face, use fonte autorizada local e recalcule geometria.

## 3. CSS igual, mas responsividade errada

**Causa:** wrapper extra, divisor irmão removido, ordem de flex/grid alterada, atributos reserializados.

**Correção:** extração por offsets, SHA/concatenação, comparação de filhos do root e computed rectangles.

## 4. 404 no build, mas dev funciona

**Causa:** import CSS url relativo, srcset faltando, import dinâmico ou public assets incorretos.

**Correção:** verificar dist com HTTP real e Network, não apenas npm run dev.

## 5. Trackers removidos do HTML reaparecem

**Causa:** hidratação React/TanStack injeta scripts de head.

**Correção:** neutralizar analytics na versão local HTML e fonte de reinjeção no preview bundle. Verificar Network depois de hydration, scroll, click. Não alterar snapshot bruto.

## 6. Screenshot full-page apresenta espaços em branco

**Causa:** lazy loading e IntersectionObserver não dispararam.

**Correção:** scroll sweep, aguardar fontes/mídias/entradas, voltar ao topo, capturar.

## 7. React avisa sobre fetchpriority

**Causa:** html-react-parser normaliza atributos, React espera fetchPriority.

**Correção:** preservar case no parser (lowerCaseAttributeNames:false) e mapear explicitamente a prop. Preservar SVG viewBox.

## 8. Linha SVG do gráfico está invisível

**Causa:** clip-path inicial em 100% não foi aberto pelo novo runtime.

**Correção:** animação clip-path de 100% a 0%; reduced-motion com linha visível; conferir computed style.

## 9. Cards e labels ficam opacity:0 indefinidamente

**Causa:** observer genérico alterou opacity inline e script da sequência procurava o valor transitório style.opacity=0.

**Correção:** marcar alvos estáveis data-*-stage, agendar por eles, estado complete, opacity1/transform none. Testar cada span.

## 10. Navbar não transiciona no scroll

**Causa:** CSS correto, porém sem listener/data-scrolled.

**Correção:** estado scrolled + transition CSS de blur/surface/padding/radius, listener passive e RAF.

## 11. Ticker parado ou pulando no loop

**Causa:** distância ignorando gap, falta duplicação ou animation-play-state.

**Correção:** duas cópias, medir largura exata e animar somente distância do primeiro conjunto; pause hover/focus/touch.

## 12. FAQ abre mas seta não gira

**Causa:** CSS não seleciona o ícone real ou QA lê transform enquanto regra usa rotate.

**Correção:** aria-expanded no botão, seletor estável, computed rotate, transição 90° ↔ −90°.

## 13. 7d/30d/12m altera dados, mas barras não animam

**Causa:** motion separado da regra de valores; ou dois click handlers concorrentes.

**Correção:** manter handler principal e usar CustomEvent para disparar só WAAPI/CSS visual.

## 14. Terceiro card sticky fica invisível no celular

**Causa:** observer criado apenas no pai, terceiro card entra depois.

**Correção:** IntersectionObserver por card e scroll real até ele, preservando top offsets.

## 15. Cursor SVG permanece sem JavaScript

**Causa:** CSS minificado define --cursor-arrow e --cursor-hand com data URI SVG.

**Correção:** camada tokens.css com cursor:auto para documento, cursor:pointer links/botões e cursor:text inputs.

## 16. Sidebar visual ainda entra no Tab

**Causa:** pointer-events:none não remove tabindex/role=button nem handlers de teclado.

**Correção:** remover listeners/roles/tabindex e preservar apenas o desenho visual.

## 17. Cursor “mão” dentro do card não é CSS global

**Causa:** markup SVG decorativo simula mouse e seleção.

**Correção:** remover o cursor fake e overlay do card, mantendo a frase e a tipografia.

## 18. Vídeo externo bloqueado/autoplay inconsistente

**Causa:** cross-origin 401, autoplay policy, muted/playsInline, visibilidade.

**Correção:** documentar dependência externa; usar mídia própria autorizada; não bypass.

## 19. Após copiar para Desktop, Vite falha com JSON

**Causa:** PowerShell Set-Content criou BOM no package.json. JSON do Vite/PostCSS falhou.

**Correção:** salvar arquivos JSON UTF-8 **sem BOM**, npm install/ci no destino, rebuild. Evitar caminhos absolutos fixos.

## 20. Scripts de extração apagam personalizações

**Causa:** rerun sobre fragmentos já editados.

**Correção:** hash e fail-on-drift, sem sobrescrever; catálogos criar apenas quando faltam, salvo --force autorizado.

## 21. Pixel score caiu depois que usuário removeu seções

**Causa:** mudança intencional, não bug de clone.

**Correção:** comparar componentes correspondentes; documentar seções removidas e nova altura, sem exigir paridade global.

## 22. “Cópia perfeita” é impossível de editar

**Causa:** espelho depende de JS minificado do terceiro ou só contém screenshots.

**Correção:** benchmark e app próprio separados, fontes/mídia, componentes por seção, conteúdo central, animações e QA.

## Triagem rápida

1. Conferir URL/porta aberta.
2. Inspecionar Network, Console, computed styles e DOM.
3. Reproduzir desktop/mobile.
4. Comparar benchmark e app mesmo estado.
5. Corrigir um subsystem com módulo isolado.
6. Executar check, test, build.
7. Atualizar preview realmente servido.
8. QA novamente e documentar o delta.
