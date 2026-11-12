/**
 * Fonte central de conteúdo e navegação da landing Ulls.
 *
 * No primeiro momento os overrides estão vazios para manter o benchmark
 * geométrico fiel. A reformulação para Ulls será feita neste arquivo e nos
 * componentes HTML/React independentes, sem mexer na referência congelada.
 */
export type TextEdit = {
  selector: string;
  text: string;
};

export type ImageEdit = {
  selector: string;
  src: string;
  alt?: string;
};

export type LinkEdit = {
  selector: string;
  href: string;
};

export type SectionContent = {
  text?: TextEdit[];
  images?: ImageEdit[];
  links?: LinkEdit[];
};

export const brand = {
  name: "Ulls Creators",
  domain: "ulls.com.br",
  supportEmail: "help@ulls.com.br",
  heroCTA: "#contato-v5",
  brandColor: "#82d8d0",
} as const;

/**
 * Os widgets artificiais não fazem parte do layout estático da referência e
 * alteram screenshots. Ative-os quando construirmos os widgets próprios Ulls.
 * A lógica de consentimento e ajuda permanece disponível no módulo behavior.
 */
export const uiFeatures = {
  showDemoCookieBanner: false,
  showDemoHelpBubble: false,
} as const;

/**
 * Blocos desativados a pedido durante a adaptação Kirvano → Ulls Creators.
 * Eles deixam de existir na árvore DOM/render, não ocupam espaço e não
 * carregam iframe ou mídia; os templates ficam guardados em src/sections/
 * para eventual reaproveitamento, sem alterar reference/kirvano/.
 */
export const disabledSections = [
  "05-integracoes", // ticker de logos de parceiros/marcas
  "11-imprensa", // "A Kirvano na mídia" + cards de notícias
  "12-summit", // vídeo e conteúdo Influent Summit
] as const;

/**
 * Exemplo:
 * hero: {
 *   text: [{ selector: "h1", text: "Sua próxima campanha começa aqui." }],
 *   links: [{ selector: "a[href*='signup']", href: "#contato-v5" }]
 * }
 *
 * Cada seletor atua somente dentro do componente nomeado. Para textos que
 * contêm spans decorativos, edite diretamente o template HTML da seção.
 */
export const sectionContent: Record<string, SectionContent> = {};
