/**
 * Componentes independentes da landing.
 *
 * Cada componente tem seu próprio template em src/sections/<nome>.html.
 * Alterações em uma seção não afetam a estrutura das demais. A etapa inicial
 * reaproveita o markup de referência sem transformá-lo em JS compilado; daí
 * podemos substituir cada template por JSX nativo à medida que reformulamos
 * o conteúdo da Ulls.
 */
import { Markup } from "./Markup";

export const HelpWidget = () => <Markup name="overlays" />;
export const Announcement = () => <Markup name="hero-announcement" />;
export const Header = () => <Markup name="hero-navigation" />;
export const Hero = () => <Markup name="hero-main" />;
export const HeroFade = () => <Markup name="hero-fade" />;

export function HeroShell() {
  return (
    <div className="relative pt-[128px] md:pt-[136px]">
      <Announcement />
      <Header />
      <Hero />
      <HeroFade />
    </div>
  );
}

export const Benefits = () => <Markup name="01-parceiro" />;
export const GrowthPlatform = () => <Markup name="02-escalar" />;
export const Payments = () => <Markup name="03-pagamentos" />;
export const Features = () => <Markup name="04-recursos" />;
export const Integrations = () => <Markup name="05-integracoes" />;
export const Checkout = () => <Markup name="06-checkout" />;
export const Pricing = () => <Markup name="07-planos" />;
export const Contact = () => <Markup name="08-contato" />;
export const Testimonials = () => <Markup name="09-depoimentos" />;
export const Manifesto = () => <Markup name="10-manifesto" />;
export const Press = () => <Markup name="11-imprensa" />;
export const Summit = () => <Markup name="12-summit" />;
export const FAQ = () => <Markup name="13-faq" />;
export const Footer = () => <Markup name="footer" />;

const registry = {
  "overlays": HelpWidget,
  "header": HeroShell,
  "01-parceiro": Benefits,
  "02-escalar": GrowthPlatform,
  "03-pagamentos": Payments,
  "04-recursos": Features,
  "05-integracoes": Integrations,
  "06-checkout": Checkout,
  "07-planos": Pricing,
  "08-contato": Contact,
  "09-depoimentos": Testimonials,
  "10-manifesto": Manifesto,
  "11-imprensa": Press,
  "12-summit": Summit,
  "13-faq": FAQ,
  "footer": Footer,
} as const;

export function LandingBlock({ name }: { name: string }) {
  const key = name as keyof typeof registry;
  const Component = registry[key];
  if (!Component) {
    return <Markup name={name} />;
  }
  return <Component />;
}
