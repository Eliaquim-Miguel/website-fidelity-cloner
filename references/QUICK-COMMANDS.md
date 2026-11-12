# Comandos de trabalho — sequência curta (pode copiar)

O pacote fornece ferramentas genéricas de bootstrapping e captura. Os scripts originais específicos Ulls/Kirvano estão em examples/original-pipeline-scripts e não devem ser executados sem adaptar domínio e caminhos.

## Criar referência local

~~~bash
python scripts/capture_public.py --url https://example.com/ --output ./reference/example --sitemap --max-pages 100
python scripts/verify_assets.py --root ./reference/example
python -m http.server 4319 --directory ./reference/example
~~~

Se faltarem assets lazy/dinâmicos, inspecione no browser, baixe legitimamente e atualize manifest. Um scanner HTTP não substitui reconhecimento visual.

## Dividir SSR sem alterar o markup

~~~bash
python scripts/split_ssr.py --html ./reference/example/index.html --out ./work/example/sections --inspect
python scripts/split_ssr.py --html ./reference/example/index.html --out ./work/example/sections --write
~~~

## Gerar app React/Vite editável

~~~bash
python scripts/bootstrap_react.py --output ./work/example-react --sections ./work/example/sections --css ./reference/example/assets/style.css --public ./reference/example
cd ./work/example-react
npm install
npm run check
npm run build
npm run dev
~~~

Substitua o caminho --css pelo arquivo realmente capturado. Se o site não possui um CSS separado, não forneça --css e construa o CSS a partir dos tokens medidos.

## Testar browser (Playwright-core opcional)

Na raiz da skill, primeiro:

~~~bash
cd scripts
npm install
cd ..
~~~

QA:

~~~bash
node scripts/qa_playwright.mjs --reference http://127.0.0.1:4319/ --clone http://127.0.0.1:4330/ --output ./qa/result
~~~

O script tenta Chrome/Chromium local conforme opções. Compare o MESMO navegador, preferencialmente em contextos isolados e com warm-up scroll. Se não conseguir abrir um navegador, não invente resultados: execute inspeção manual ou configure CDP.

## Adaptação por etapas

1. Aprovar geometria.
2. Trocar textos em src/content/overrides.json ou componentes tipados.
3. Trocar imagem e logo autorizados.
4. Trocar links e integrações por domínio próprio.
5. Criar animações independentes.
6. Repetir QA em desktop/mobile.
7. Preparar publicação após revisar direitos/consentimento.
