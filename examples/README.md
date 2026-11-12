# Código real preservado para estudo — não é a skill de terceiros

Esta pasta inclui **arquivos de engenharia escritos durante o projeto Ulls Creators**, para que outra IA consiga estudar o código exato usado na captura, extração, componentização e animações. Não é um dump de HTML/CSS/assets proprietários do site público.

## original-pipeline-scripts/

Scripts do projeto original (hardcoded para o caso Kirvano/Softriver; NÃO rodar cegamente em outro domínio):

| Script | Finalidade |
| --- | --- |
| mirror_kirvano.py | SSR público e assets via sitemap/HTML/JS |
| mirror_softriver.py | Captura pública anterior, com fluxo diferente para site estático |
| vendor_kirvano_fonts.py | Fontes locais Inter/Inter Tight/Fustat |
| build_preview.py | Dist/ para benchmark, edições não destrutivas e app editável |
| check_mirror.py | Integridade de referências do benchmark |
| extract_kirvano_sections.py | Parser offsets/manifest/SHA para 13 seções originais |
| extract_kirvano_hero.py | Separação do HeroShell em quatro partes |
| sync_ulls_landing_assets.py | Copiar media/fonts/CSS para React próprio |
| generate-catalog.cjs | Text nodes, imagens e links extraídos para JSON |

**Por que esses arquivos importam?** A documentação explica conceitos; estes scripts registram as decisões implementadas, incluindo casos em que a forma da página exigiu código específico. Em outro site, comece por scripts/ do pacote universal e só adapte técnicas justificadas.

## react-motion-source/

Arquivos de engenharia da aplicação React editável, incluindo:

- App.tsx e components/Markup.tsx / sections.tsx.
- content/site.ts.
- behavior/index.mjs, adapters.mjs, chart.mjs, dashboard-effects.mjs, scale-effects.mjs, testimonials-effects.mjs.
- CSS separado de tokens, design system, navbar/dashboard, cards e depoimentos/FAQ.
- Testes comparativos browser: compare-cdp.mjs, check-native-cursor.mjs.

Esses arquivos **não compõem um app isolado**. Dependem dos HTML sections, public media/fonts e catálogos que pertencem ao projeto original e não foram distribuídos com a skill. Servem como exemplos aprofundados de reconstrução de lógica. Para executar um app novo, use templates/react-vite e bootstrap_react.py com uma referência autorizada.

## O que foi deliberadamente excluído

- HTML, CSS e JavaScript minificado original da Kirvano e do Softriver.
- Imagens, logos, vídeo e fontes baixados de sites terceiros.
- Dados de login, chaves, banco, cookies e arquivos privados.
- Screenshots/full-page snapshots da referência.
- Skills originais de terceiros (website-cloner, website-cloner-open, clone-website etc.): licenças próprias e dependências não compartilhadas.

## Escopo

O método é transferível, mas nenhum algoritmo universal extrai automaticamente shaders, WebGL ou APIs fechadas. A outra IA deve fazer medição/QA real e registrar tudo que exigir recriação manual.
