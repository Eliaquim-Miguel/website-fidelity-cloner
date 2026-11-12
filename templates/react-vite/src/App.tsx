import manifest from "./sections/manifest.json";
import { SectionMarkup } from "./components/SectionMarkup";

type Entry = { file?: string; filename?: string; name?: string };
type Manifest = {
  render_order?: string[];
  entries?: Entry[];
  root?: { original_class?: string; opening_tag?: string };
};

const data = manifest as Manifest;
const entries = Array.isArray(data.render_order)
  ? data.render_order
  : (data.entries || []).map(item => item.file || item.filename || item.name || "");
const rootClass =
  data.root?.original_class ||
  data.root?.opening_tag?.match(/\bclass=["']([^"']*)["']/)?.[1] ||
  "";

export function App() {
  return (
    <div className={rootClass} data-clone-app>
      {entries.filter(Boolean).map((name, i) => (
        <SectionMarkup key={name + ":" + i} name={name.replace(/\.html$/, "")} />
      ))}
    </div>
  );
}
