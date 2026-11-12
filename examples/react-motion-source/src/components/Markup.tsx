import parse, { attributesToProps } from "html-react-parser";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { sectionContent } from "../content/site";
import copyCatalog from "../content/copy.json";
import imageCatalog from "../content/images.json";
import linkCatalog from "../content/links.json";

const templates = import.meta.glob("../sections/*.html", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

type CopyEntry = { key: string; original: string; text: string };
type ImageEntry = { original: string; src: string; alt?: string };
type LinkEntry = { original: string; href: string; label?: string };
type Catalog<T> = Record<string, T[]>;

const copy = copyCatalog as Catalog<CopyEntry>;
const images = imageCatalog as Catalog<ImageEntry>;
const links = linkCatalog as Catalog<LinkEntry>;
const safeURL = (url: string) => /^(?:\/|#|https?:\/\/|mailto:|tel:)/i.test(url);

function prepareHTML(id: string, raw: string): string {
  // Estabiliza seletores de comportamento antes de o conteúdo ganhar nomes
  // e textos próprios da Ulls. Os marcadores não acrescentam wrappers nem
  // mudam dimensões; evitam atrelar o ticker ao título "Kirvano".
  if (id === "02-escalar") {
    raw = raw.replace(/<section(\s)/, "<section data-ulls-scale-section$1");
  }
  if (id === "hero-main") {
    raw = raw.replace(
      '<aside class="w-56 shrink-0',
      '<aside data-ulls-dashboard-sidebar class="w-56 shrink-0'
    );
  }
  if (id === "09-depoimentos") {
    raw = raw
      .replace(/<section(\s)/, "<section data-ulls-testimonials$1")
      .replace(
        '<div class="flex gap-5 w-max">',
        '<div data-ulls-testimonials-track class="flex gap-5 w-max">'
      );
  }
  const overrides = sectionContent[id];
  const texts = copy[id] || [];
  const imgs = images[id] || [];
  const anchors = links[id] || [];
  const contentChanged = texts.some((entry) => entry.text !== entry.original);
  const mediaChanged = imgs.some((entry) => entry.src !== entry.original);
  const linksChanged = anchors.some((entry) => entry.href !== entry.original);
  const hasOverrides = Boolean(
    overrides &&
      ((overrides.text?.length ?? 0) > 0 ||
        (overrides.images?.length ?? 0) > 0 ||
        (overrides.links?.length ?? 0) > 0)
  );

  // When no one has edited this section, render the EXACT original markup;
  // don't reserialize it, because that can change SVG attributes and spacing.
  if (!contentChanged && !mediaChanged && !linksChanged && !hasOverrides) {
    return raw;
  }

  const fragment = document.createElement("template");
  fragment.innerHTML = raw;

  if (contentChanged) {
    const walker = document.createTreeWalker(fragment.content, NodeFilter.SHOW_TEXT);
    let index = 0;
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (parent?.closest("script,style,svg")) continue;
      const originalText = node.textContent || "";
      const trimmed = originalText.trim();
      if (!trimmed) continue;
      const entry = texts[index++];
      if (entry && entry.text !== entry.original && trimmed === entry.original) {
        const leading = originalText.match(/^\s*/)?.[0] || "";
        const trailing = originalText.match(/\s*$/)?.[0] || "";
        node.textContent = leading + entry.text + trailing;
      }
    }
  }

  if (mediaChanged) {
    fragment.content.querySelectorAll("img").forEach((element, index) => {
      const entry = imgs[index];
      if (!entry || entry.src === entry.original || !safeURL(entry.src)) return;
      element.setAttribute("src", entry.src);
      element.removeAttribute("srcset");
      if (typeof entry.alt === "string") element.setAttribute("alt", entry.alt);
    });
  }

  if (linksChanged) {
    fragment.content.querySelectorAll("a").forEach((element, index) => {
      const entry = anchors[index];
      if (!entry || entry.href === entry.original || !safeURL(entry.href)) return;
      element.setAttribute("href", entry.href);
    });
  }

  for (const rule of overrides?.text ?? []) {
    for (const element of fragment.content.querySelectorAll(rule.selector)) {
      // Don't destroy SVGs, icon wrappers or nested animation spans.
      if (element.children.length === 0) element.textContent = rule.text;
    }
  }

  for (const rule of overrides?.links ?? []) {
    for (const element of fragment.content.querySelectorAll(rule.selector)) {
      if (element instanceof HTMLAnchorElement) element.href = rule.href;
      else element.setAttribute("href", rule.href);
    }
  }

  for (const rule of overrides?.images ?? []) {
    for (const element of fragment.content.querySelectorAll(rule.selector)) {
      if (element.tagName !== "IMG") continue;
      element.setAttribute("src", rule.src);
      element.removeAttribute("srcset");
      if (rule.alt) element.setAttribute("alt", rule.alt);
    }
  }
  return fragment.innerHTML;
}

export function Markup({ name }: { name: string }): ReactNode {
  const content = useMemo(() => {
    const raw = templates[`../sections/${name}.html`];
    if (!raw) {
      console.warn(`[Ulls] componente ausente: ${name}.html`);
      return null;
    }
    return parse(prepareHTML(name, raw), {
      htmlparser2: { lowerCaseAttributeNames: false },
      replace(node) {
        if (node.type !== "tag" || node.name !== "img") return;
        const priority = node.attribs.fetchPriority || node.attribs.fetchpriority;
        if (!priority) return;
        const props = attributesToProps(node.attribs);
        delete props.fetchpriority;
        return <img {...props} fetchPriority={priority as "high" | "low" | "auto"} />;
      },
    });
  }, [name]);
  return content;
}
