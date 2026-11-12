# Transformar um espelho em componentes editáveis

**Conceito:** o benchmark congelado prova o que foi capturado. O projeto React independente transforma aquilo em fonte para edição. Não confunda os dois.

## Duas passagens, não uma

**Passagem 1: fidelidade.** Extraia HTML bruto por seção e reutilize as classes, estilos, SVGs e fontes. Monte no React com componentes de baixo nível sem wrappers extras. Neste ponto o app é editável por arquivo, embora parte do markup continue semelhante ao original.

**Passagem 2: manutenibilidade.** Migre gradualmente cada template para JSX/TSX, crie cards reutilizáveis, tokens, regras de design, slots, CMS e interações. Compare após cada migração para evitar drift. O resultado não precisa continuar parecido com a referência após o usuário pedir rebrand; desvios intencionais são válidos.

## Como criar o manifesto

~~~json
{
  "source": "reference/example/index.html",
  "root": {"tag":"div", "original_class":"relative w-full ..."},
  "render_order": [
    "overlays.html",
    "header.html",
    "01-beneficios.html",
    "02-recursos.html",
    "footer.html"
  ],
  "integrity": {
    "root_children": 5,
    "markup_identical_to_source": true,
    "assembled_sha256": "..."
  }
}
~~~

Não é obrigatório que cada site tenha exatamente o mesmo número de blocos. Se o root tem quatro dividers irmãos, registre-os como arquivos próprios ou como prefixo do bloco seguinte. O manifesto precisa explicar sua escolha.

## Montagem por arquivos HTML raw

No React/Vite:

~~~tsx
import parse from "html-react-parser";

const templates = import.meta.glob("../sections/*.html", {
  query: "?raw",
  import: "default",
  eager: true
}) as Record<string, string>;

export function SectionMarkup({ name }: { name: string }) {
  const text = templates["../sections/" + name + ".html"];
  if (!text) return null;
  return parse(text, {
    htmlparser2: { lowerCaseAttributeNames: false }
  });
}
~~~

Este é um exemplo mínimo. O arquivo real da Ulls também aplica catálogos de copy/media/link antes do parse, trata atributos React e preserva HTML bruto quando nada mudou.

## Erro clássico: alterar a hierarquia

ERRADO:

~~~tsx
<div className="nova-wrapper">
  <SectionMarkup name="hero" />
</div>
~~~

Se o CSS original depende de filhos diretos, sticky, :nth-child, grid ou flex, esse wrapper muda a geometria.

CORRETO: monte os mesmos irmãos do root original, com wrappers somente onde a referência também os possui. Use fragments sem wrapper quando puder.

## HeroShell com quatro partes

O caso real tinha um div que continha ribbon, navbar, hero e fade. Dividi-lo em:

- Announcement — aviso/ribbon.
- Header — navegação.
- Hero — H1, CTA e dashboard ilustrativo.
- HeroFade — máscara e gradiente de fechamento.

Mantenha o wrapper **externo existente** e concatene as quatro partes na mesma ordem; confira SHA/length após extrair. Evite mover o header para fora do wrapper original se o CSS usa positioned ancestors.

## Conteúdo centralizado: JSON por seção

~~~json
{
  "hero-main": [
    {"key":"hero-main:001","original":"A frase da referência","text":"Sua nova mensagem"}
  ]
}
~~~

Mantenha:

- original: texto/hash capturado (não alterar).
- text: valor editável.
- key: ID estável, independentemente do texto em si.

Faça o mesmo para imagens e links. Um catálogo extraído de text nodes é um *ponto de partida*, não um CMS robusto. Quando conteúdo fica semanticamente importante, transforme em estrutura tipada:

~~~ts
export const heroContent = {
  eyebrow: "CREATORS",
  title: "Sua mensagem",
  description: "Texto com benefício real.",
  ctaLabel: "Participar",
  ctaHref: "/candidatura"
};
~~~

Para texto com SVG ou spans separados por palavra, não faça element.textContent = novoValor num pai complexo: isso destrói ícones e efeitos. Edite text nodes identificados ou migre a seção para JSX.

## Catálogo de imagens e links

Imagens: preserve src original, alt, srcset, sizes e dimensões. Quando src muda, reveja srcset; um navegador pode continuar exibindo a imagem antiga por currentSrc se srcset original permanecer.

Links: revise href e target. Evite deixar a nova marca com links de cadastro, checkout, política de privacidade, suporte ou analytics do site espelhado.

## CSS em camadas

Ordem recomendada:

1. fonts.css (self-host).
2. reference.css (benchmark de geometria; congelado).
3. tokens.css (marca, cores, fontes).
4. components.css (design system novo).
5. motion.css e effects/*.css (animações).

Alterar cor global de um token pode afetar sombras/gradientes e métricas; teste após mudança. Não use !important indiscriminadamente. Use escopo [data-app] para estilos de substituição.

## Progressive enhancement e cleanup

~~~js
const instances = new WeakMap();

export function setupExample(root = document) {
  if (instances.has(root)) return instances.get(root).cleanup;
  const controller = new AbortController();
  const target = root.querySelector("[data-example]");
  const onClick = () => {/* estado real, não dado fictício */};
  target?.addEventListener("click", onClick, { signal: controller.signal });
  const cleanup = () => {
    controller.abort();
    instances.delete(root);
  };
  instances.set(root, { cleanup });
  return cleanup;
}
~~~

Em React StrictMode, effect pode inicializar/limpar mais de uma vez em desenvolvimento. O módulo precisa ser idempotente; não injete múltiplas barras de cookie, listeners ou observers.

## Manter a referência intacta ao personalizar

- Não rode scripts de extração sobre arquivos já editados sem checagem SHA.
- Não misture o snapshot e o app no mesmo dist sem um seletor explícito de build.
- Ao pedir “tira a seção”, prefira controle no manifest/disabledSections. O arquivo original permanece guardado e o DOM não carrega nada daquela seção.
- Ao pedir “deixa o cursor normal”, aplique cursor:auto/pointer/text na camada de tokens ao invés de editar megabytes de CSS minificado.
- Ao pedir “quero o botão visual, mas não clicável”, remova event listeners, tabindex, role=button e pointer; não apenas interceptar click com CSS.
- Em migração de marca, atualize textos e imagens depois de aprovar comunicação. Não precise redescobrir a geometria por causa da copy.

## Gate de conclusão da componentização

- Todo fragmento tem nome, ordem e owner no manifest.
- Não há scripts da referência exigidos como runtime do app.
- O site compila, e seu layout é medido contra benchmark.
- Fontes e imagens locais funcionam nos três breakpoints.
- A maior parte das alterações simples ocorre no catálogo, CSS tokens ou componente específico.
- Modificar FAQ não deveria quebrar header; modificar card não deveria quebrar footer.
