import { useEffect } from "react";
import { LandingBlock } from "./components/sections";
import manifest from "./sections/manifest.json";
import { initLandingBehavior } from "./behavior/index.mjs";
import { setupDashboardEffects } from "./behavior/dashboard-effects.mjs";
import { setupTestimonialsEffects } from "./behavior/testimonials-effects.mjs";
import { setupScaleEffects } from "./behavior/scale-effects.mjs";
import { disabledSections, uiFeatures } from "./content/site";

type BlockRecord = {
  name?: string;
  slug?: string;
  file?: string;
  id?: string | null;
  description?: string;
};

const entries: BlockRecord[] = Array.isArray(manifest)
  ? (manifest as BlockRecord[])
  : "render_order" in manifest && Array.isArray(manifest.render_order)
    ? manifest.render_order.map((file) => ({ file }))
    : (manifest as { entries?: BlockRecord[] }).entries ?? [];
const disabled = new Set<string>(disabledSections);
const visibleEntries = entries.filter((entry) => {
  const name = (entry.file || entry.name || entry.slug || "").replace(/\.html$/i, "");
  return name && !disabled.has(name);
});

export function App() {
  useEffect(() => {
    const behavior = initLandingBehavior({
      document,
      autoCreateConsent: uiFeatures.showDemoCookieBanner,
      autoCreateHelp: uiFeatures.showDemoHelpBubble,
    });
    const stopDashboard = setupDashboardEffects(document);
    const stopTestimonials = setupTestimonialsEffects(document);
    const stopScale = setupScaleEffects(document);
    return () => {
      stopScale();
      stopDashboard();
      stopTestimonials();
      behavior.destroy();
    };
  }, []);

  return (
    <div
      className="relative w-full bg-[#111111] overflow-hidden"
      data-ulls-landing
      data-reference="kirvano"
    >
      {visibleEntries.map((entry, index) => {
        const name = (entry.file || entry.name || entry.slug || "").replace(
          /.html$/i,
          ""
        );
        return <LandingBlock key={entry.slug || entry.file || index} name={name} />;
      })}
    </div>
  );
}
