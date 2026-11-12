# Protocolo de QA — fidelidade medida, não aparência subjetiva

## Tipos de validação (quatro camadas)

1. **Integridade:** arquivos, rotas, manifests, fontes, imagens, status HTTP e hashes.
2. **Geometria:** bounding boxes/scrollHeight, breakpoints, layout e posicionamento.
3. **Visual:** screenshots, diff, cor, fonte, sombras, motion e recorte.
4. **Funcional:** menu, rolagem, click, FAQ, gráficos, ticker, focus, reduced-motion e erros.

Uma comparação visual sem QA de interação é incompleta; código que compila mas nunca foi aberto no navegador também.

## Ambiente controlado

Registre:

- URL e timestamp da referência.
- URL do clone, commit ou hash do build.
- Versão do navegador, viewport w×h, DPR, zoom, tema de sistema.
- Estado de cookies/consentimento, fontes carregadas, vídeos pausados/rodando.
- Posição de scroll e momento da animação.
- Se os recursos externos falharam (Google Fonts, Vimeo, CAPTCHA, CDN, etc.).
- Se o screenshot foi feito **antes** ou **depois** do warm-up de scroll.

Não comparar screenshot de um navegador com DPR 2 contra outro em DPR 1. Não comparar frames de vídeo que mudaram. No caso real, uma parte do diff residual era conteúdo/movimento temporal.

## Tabela mínima de medições

~~~text
Viewport: 1440x900, DPR1, Chrome X
                       REFERÊNCIA       CLONE         DELTA
scrollHeight           _____px          _____px       _____px
header x/y/w/h         _____            _____         _____
H1 x/y/w/h             _____            _____         _____
section count          _____            _____         _____
section 1 y/h          _____            _____         _____
section 2 y/h          _____            _____         _____
...
font-family H1         _____            _____         _____
font-weight H1         _____            _____         _____
horizontal overflow    sim/não          sim/não
~~~

Use screenshot de primeira dobra e fullpage, e guarde ambos. Se o site for muito alto, faça capturas em fatias para localizar divergência.

## Medir bounding boxes sem biblioteca específica

~~~js
function probe() {
  const rect = el => {
    const r = el.getBoundingClientRect();
    return { x:r.x, pageY:r.y + scrollY, width:r.width, height:r.height };
  };
  const sel = 'header, h1, main section, [data-qa-component], footer';
  return {
    pageHeight: document.documentElement.scrollHeight,
    blocks: [...document.querySelectorAll(sel)].map((el, i) => ({
      i, tag: el.tagName, id: el.id,
      className: String(el.className).slice(0,120),
      ...rect(el)
    }))
  };
}
probe();
~~~

Se o site tem seções que não usam <section>, crie seletores para os filhos visuais do container de topo.

## Teste de assets

- Cada src/href local deve retornar 200 e não uma página HTML de fallback.
- Verifique srcset/currentSrc em cada breakpoint.
- Fontes: document.fonts.check, @font-face carregadas, weights corretos.
- SVG inline: viewBox, caminhos, clipPath e máscaras; sem distorção.
- Vídeos: fonte, poster, muted/autoplay/playsInline, estado paused e erro de rede.
- CSS com URLs relativas e imports dinâmicos precisam ser resolvidos no build FINAL, não só Vite dev.

## Testes de animação

Para cada elemento importante, anote:

| Alvo | Inicial | Durante | Final | Evento | Redução de movimento |
| --- | --- | --- | --- | --- | --- |
| Hero dashboard | máscara cobrindo, labels opacity0 | cards em stagger e svg revela | labels opacity1, linha visível | load/IO | tudo visível |
| Navbar | padding amplo, fundo sem blur | ease 300ms | padding compacto, blur/fundo | scroll | troca imediata |
| FAQ icon | rotate 90deg | transição rotate | -90deg ao abrir | click | estado imediato |
| Ticker | track x=0 | x decresce | loop em largura da primeira cópia | RAF/CSS linear | parado |
| Cards sticky | opacity0 e translateY | stagger | opacity1 transform none | IO por card | tudo visível |
| Barras do gráfico | alturas-base | scaleY/WAAPI visual | alturas período selecionado | click 7d/30d/12m | salto sem animação |

Inspecione estado CSS computado, não apenas presença da classe. Um data attribute “entered=true” não prova visualização se um CSS!important mantém opacity 0.

## QAs por viewport

Desktop:
- Menus aparecem no breakpoint correto, hover e blur funcionam, container max-width coerente.
- Sidebars, dashboards, grids e cards sticky sem clipping.
- Tooltips/pointer chart não extrapolam container.

Tablet:
- Colunas e nav adaptam sem cortar headings.
- Fontes não estouram nem criam scroll horizontal.

Mobile:
- Menu abre, botão fecha, fora do menu não quebra o estado.
- Sticky cards entram individualmente ao alcançar viewport.
- Ticker não pula, botões têm área de toque, FAQ acessível, não há overflow horizontal.
- Vídeos respeitam políticas de autoplay, não cobrem CTA.

## Testes de acessibilidade

- Tab percorre controles reais; itens de mock “não interativos” não ganham role=button/tabindex/handler.
- FAQ usa aria-expanded correto, clique e teclado.
- Pause em hover/focus/touch para ticker quando pertinente.
- prefers-reduced-motion retira movimento sem esconder conteúdo.
- Inputs exibem cursor de texto; links e buttons usam pointer nativo quando clicáveis.
- Evite cursor SVG personalizado se não solicitado.

## Análise de screenshots e percentuais

Percentual de pixels exatamente iguais mede coincidência do quadro, não qualidade absoluta. Registre também MAE RGB e tolerância geométrica. Não use um número de “fidelidade” sem explicar metodologia.

Um site pode ter 0px de diferença na geometria e 90% de pixel parity se animações, sombras, fontes ou vídeos estiverem em frames diferentes.

Comparações só são válidas com dimensões de screenshots idênticas. Em páginas de alturas diferentes, compare seções correspondentes, não corte o restante silenciosamente. Se o usuário removeu três seções, registre a mudança intencional e não exija igualdade de altura global.

## Testes de rede e privacidade

- Inspecione se o benchmark local chama trackers de terceiros. A partir de HTML React SSR, verifique se hidratação reinstala tags.
- Não envie dados reais em formulários de referência.
- Prefira mocks de formulário para demo ou backend do próprio usuário.
- Nunca copie cookies da conta real para sessão automatizada.

## Critérios de aprovação

Classifique cada item:
- PASS: medida/funcionalidade testada e correta.
- WARN: desvio leve ou dependência externa conhecida.
- FAIL: funcionalidade quebrada ou geometria divergente sem justificativa.
- N/T: não testado — não disfarçar como sucesso.

Não declare “perfeito” enquanto houver FAIL relevante. Traga links para o preview quando realmente estiver servindo e aberto.
