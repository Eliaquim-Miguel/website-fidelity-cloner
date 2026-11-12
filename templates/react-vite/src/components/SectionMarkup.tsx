import parse, { attributesToProps } from "html-react-parser";
import { useMemo } from "react";
import type { ReactNode } from "react";
import overrides from "../content/overrides.json";

const templates = import.meta.glob("../sections/**/*.html", {
  query: "?raw",
  import: "default",
  eager: true
}) as Record<string, string>;

type Override = { text?: Record<string, string> };
const content = overrides as Record<string, Override>;

function editHTML(raw: string, section: string) {
  const edits = content[section]?.text;
  if (!edits || !Object.keys(edits).length) return raw;
  const template = document.createElement("template");
  template.innerHTML = raw;
  for (const [selector, value] of Object.entries(edits)) {
    try {
      template.content.querySelectorAll(selector).forEach(node => {
        if (!node.children.length) node.textContent = value;
      });
    } catch (error) {
      console.warn("Invalid section selector", section, selector, error);
    }
  }
  return template.innerHTML;
}

export function SectionMarkup({ name }: { name: string }): ReactNode {
  const markup = useMemo(() => {
    const raw = templates["../sections/" + name + ".html"];
    if (!raw) return null;
    return parse(editHTML(raw, name), {
      htmlparser2: { lowerCaseAttributeNames: false },
      replace(node) {
        if (node.type !== "tag" || node.name !== "img") return;
        const value = node.attribs.fetchpriority || node.attribs.fetchPriority;
        if (!value) return;
        const props = attributesToProps(node.attribs);
        delete props.fetchpriority;
        return <img {...props} fetchPriority={value as "high" | "low" | "auto"} />;
      }
    });
  }, [name]);
  return markup;
}
