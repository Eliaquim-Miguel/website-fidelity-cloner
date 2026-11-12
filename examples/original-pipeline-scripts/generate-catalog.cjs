/**
 * Generate editable copy/media/link catalogs from the Kirvano benchmark markup.
 *
 * IMPORTANT: this is a one-time extraction tool. It never overwrites edited
 * JSON unless called explicitly with --force. Use npm run catalog to create
 * missing catalogs, and edit src/content/{copy,images,links}.json afterwards.
 */
const fs = require("node:fs");
const path = require("node:path");
const { parseDocument, DomUtils } = require("htmlparser2");

const project = path.resolve(__dirname, "..");
const sections = path.join(project, "src", "sections");
const content = path.join(project, "src", "content");
const manifest = JSON.parse(fs.readFileSync(path.join(sections, "manifest.json"), "utf8"));
const sequence = manifest.render_order.flatMap((file) =>
  file === "header.html"
    ? ["hero-announcement.html", "hero-navigation.html", "hero-main.html", "hero-fade.html"]
    : [file]
);

const result = { copy: {}, images: {}, links: {} };

function visit(nodes, callback, parentName = "") {
  for (const node of nodes) {
    callback(node, parentName);
    if (node.children) visit(node.children, callback, node.name || parentName);
  }
}

for (const filename of sequence) {
  const section = filename.replace(/\.html$/, "");
  const markup = fs.readFileSync(path.join(sections, filename), "utf8");
  const document = parseDocument(markup, { decodeEntities: true });
  const copy = [];
  const images = [];
  const links = [];

  visit(document.children, (node, parent) => {
    if (node.type === "text") {
      const original = (node.data || "").trim();
      if (!original || ["script", "style", "svg", "path"].includes(parent)) return;
      copy.push({
        key: `${section}:${String(copy.length + 1).padStart(3, "0")}`,
        original,
        text: original,
      });
    }
    if (node.type === "tag" && node.name === "img") {
      const src = node.attribs?.src ?? "";
      const alt = node.attribs?.alt ?? "";
      images.push({ original: src, src, alt });
    }
    if (node.type === "tag" && node.name === "a") {
      const href = node.attribs?.href ?? "";
      links.push({
        original: href,
        href,
        label: DomUtils.textContent(node).replace(/\s+/g, " ").trim().slice(0, 90),
      });
    }
  });
  result.copy[section] = copy;
  result.images[section] = images;
  result.links[section] = links;
  console.log(
    section.padEnd(20),
    String(copy.length).padStart(3),
    "textos",
    String(images.length).padStart(3),
    "imagens",
    String(links.length).padStart(3),
    "links"
  );
}

fs.mkdirSync(content, { recursive: true });
const force = process.argv.includes("--force");
for (const [name, data] of Object.entries(result)) {
  const dest = path.join(content, `${name}.json`);
  if (fs.existsSync(dest) && !force) {
    console.log("Preservado (já existe):", dest);
    continue;
  }
  fs.writeFileSync(dest, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log("Gerado:", dest);
}
