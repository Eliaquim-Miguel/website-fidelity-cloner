# Reverse engineering de animações e estados visuais

Na cópia da Kirvano, o HTML SSR com CSS original ficou visualmente fiel, mas algumas “brincadeiras” estavam paradas: entrada do dashboard, transição do navbar, ticker de depoimentos, setas do FAQ e cards. O JavaScript minificado foi preservado apenas como referência, não copiado para lógica de produção.

## Como descobrir movimentos reais

1. Navegue no site público e capture o estado inicial, 250ms, 600ms, 1200ms e final.
2. Leia computed style e CSS animations em cada estado; busque classList, data-* e inline style que mudam.
3. Registre trigger: on mount, IO, scrollY, hover, pointermove, click, touch, focus.
4. Descubra dependências de contexto: sticky container, z-index, overflow, transform-origin, CSS vars, SVG clip-path.
5. Recrie timing, easing e estados com código próprio.
6. Verifique reduced-motion e cleanup.

## Dashboard hero — sequência/linha SVG

Detalhes reais da réplica Ulls:

- O dashboard do hero era uma **árvore DOM** com aside, cards, labels e svg da linha, não um screenshot único.
- A sidebar e os cards entravam em sequência, títulos e números por palavra.
- A linha do gráfico existia mas estava coberta por clip-path de 100%. O runtime novo abriu de 100% para 0%.
- Alguns textos como “Ticket médio”, “R$ 197”, “Pix”, “Aprovação” e “Cartão” permaneciam invisíveis porque o observer genérico alterou opacity inline e outro seletor procurava especificamente style='opacity:0'. A correção usa **marcadores estáveis data-*-stage**, agenda os spans e conclui o estado explicitamente.
- Depois o usuário pediu que o menu lateral da ilustração fosse **estático**. Mantivemos a aparência, mas tiramos handlers, tabindex/role/button/cursor pointer.

Exemplo de CSS (adaptar seletor real):

~~~css
[data-hero-chart-line] {
  clip-path: inset(0 100% 0 0);
}
[data-hero-chart-line][data-state="complete"] {
  animation: line-reveal 1100ms cubic-bezier(.16,1,.3,1) both;
}
@keyframes line-reveal {
  from { clip-path: inset(0 100% 0 0); }
  to   { clip-path: inset(0 0 0 0); }
}
@media (prefers-reduced-motion: reduce) {
  [data-hero-chart-line] { clip-path: none !important; animation: none !important; }
}
~~~

## Navbar — transição topo/scroll

O header no topo tinha mais espaçamento e sem surface escura compacta. Após rolar:

- padding-top de 24px para 12px.
- backdrop-filter blur(14px).
- fundo rgba(17,17,17,.72).
- border radius 14px, sombra leve e padding lateral ajustado.
- transição em cerca de 300ms.

Não refaça o DOM do navbar: crie data-scrolled/class em resposta ao scroll, com passive listener/RAF, e CSS escopado.

~~~js
let scheduled = false;
function update() {
  scheduled = false;
  header.toggleAttribute('data-scrolled', window.scrollY > 30);
}
window.addEventListener('scroll', () => {
  if (!scheduled) { scheduled = true; requestAnimationFrame(update); }
}, { passive: true });
~~~

## Ticker horizontal de depoimentos sem salto

Para loop infinito fluido:

- A faixa precisa conter dois conjuntos de cards com conteúdo repetido.
- Meça a largura real do primeiro conjunto **incluindo gap**.
- Anime translateX(0) até translateX(-distância) linear.
- Ao terminar, volta para translateX(0) no frame equivalente visualmente: o segundo conjunto deve começar exatamente onde o primeiro terminou.
- Remessa e dimensões mudam em mobile; recalcular via ResizeObserver quando necessário.
- Pausar ao passar mouse, foco, touch; reduced-motion remove loop.

Erros comuns: usar width:50% sem medir gap; animar sem duplicatas; reiniciar no resize sem preservar phase; cards de tamanhos variáveis que geram jump.

## FAQ e ícone com giro

Estado interno deve mudar aria-expanded no botão. CSS faz animação do ícone:

~~~css
[data-faq-trigger] [data-faq-chevron] {
  rotate: 90deg;
  transition: rotate 300ms ease;
}
[data-faq-trigger][aria-expanded="true"] [data-faq-chevron] {
  rotate: -90deg;
}
~~~

Se CSS usa propriedade individual rotate, getComputedStyle(icon).transform pode continuar como none. Leia getComputedStyle(icon).rotate. Para HTML sem data-attrs, descubra o seletor real e teste se ele acerta o SVG/span.

Não crie dois click handlers para o FAQ. Um módulo deve controlar state e aria-expanded; CSS apenas apresenta a rotação.

## Três cards de plataforma (sticky / IO / gráficos)

No caso real:

- Cada card sticky tem seu offset mobile (80px, 96px, 112px).
- As entradas são disparadas por IntersectionObserver separadamente, pois o terceiro card não entra no início do scroll mobile.
- 22/21/6 text nodes (conforme a estrutura avaliada) receberam stagger/word markers; 4 linhas de pagamento, labels de upsell e popup comissão também.
- A linha visual e as barras do gráfico receberam keyframes/WAAPI.
- Os botões 7d/30d/12m já tinham a lógica em behavior/index.mjs. O effects module **somente ouviu ulls:chart-change**, mudando animação visual sem duplicar clique ou recalcular dados.

Padrão:

~~~js
document.addEventListener('ulls:chart-change', event => {
  if (!PERIODS.has(event.detail?.period)) return;
  const bars = [...document.querySelectorAll('[data-graph-bar]')];
  bars.forEach((bar, i) => {
    bar.animate(
      [{ transform: 'scaleY(.77)', opacity: .82 },
       { transform: 'scaleY(1)', opacity: 1 }],
      { duration: 430 + i*38, easing: 'cubic-bezier(.2,.85,.25,1)' }
    );
  });
});
~~~

Se o CustomEvent nasce em outro container, escute o elemento emissor ou document e valide event.target; caso contrário a função nunca será chamada.

## Efeito a REMOVER ≠ efeito a reconstruir

O usuário pediu a remoção do cursor SVG personalizado e da ilustração de cursor que selecionava texto em um card. Foram dois trabalhos diferentes:

- Cursor global do CSS minificado da referência: sobrescrito em tokens.css com cursor:auto para documento, cursor:pointer para links/botões e cursor:text para input.
- Cursor fake dentro de card: removeu-se o markup/overlay animado e manteve-se apenas uma frase estática clean.

Nunca desligue pointer-events globalmente para “matar” um cursor: isso quebra controles legítimos.

## Ponto de atenção: vídeo/autoplay

Um vídeo pode ter HTML correto e estado diferente no clone (paused=true vs paused=false) por política do navegador. Verifique muted, autoplay, playsInline, poster, visibility e user gesture. Se Vimeo externo estiver 401, documente: não tente contornar a autorização do serviço.

## Receitas de estabilidade

- Evite selecionar spans por texto de marketing ou pela presença transitória de style opacity0.
- Marque data-attrs ao preparar markup: data-ulls-dashboard-stage, data-ulls-testimonials-track, data-ulls-scale-section.
- Nunca instale múltiplos IntersectionObservers em StrictMode sem cleanup.
- Preserve fluxo sticky; não modifique layout com transform em wrapper errado.
- No mobile, faça scroll real até cada card, não teste apenas viewport inicial.
- Animações CSS podem exigir animation-fill-mode: both/forwards para não desaparecer no fim.
- Em reduced-motion, abra máscara, conclua labels e mostre barras diretamente.
