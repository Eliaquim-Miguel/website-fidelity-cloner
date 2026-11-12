# Website Fidelity Cloner — Agent Skill

Skill aberta e independente para **analisar, espelhar com fidelidade, reconstruir em componentes editáveis e testar websites públicos autorizados**, em qualquer agente compatível com o formato Agent Skills.

## O que esta skill entrega

1. Benchmark visual preservado para comparação.
2. Assets locais e fontes, quando permitidos.
3. Arquitetura editável (React/Vite padrão; adapte ao framework do projeto).
4. Conteúdo centralizado e animações reimplementadas em módulos.
5. QA com geometria, screenshots e estados interativos medidos.
6. Relatório honesto de fidelidade, limites e diferenças.

**Não é um scraper de contas privadas nem um mecanismo de contornar proteção.** Para publicação, use conteúdo/ativos licenciados e substitua serviços comerciais do site de referência.

## Instalação no Codex

Copie a pasta INTEIRA website-fidelity-cloner, incluindo SKILL.md, para uma das localizações:

~~~text
<seu-repo>/.agents/skills/website-fidelity-cloner/SKILL.md
~/.agents/skills/website-fidelity-cloner/SKILL.md
~~~

No Windows:

~~~powershell
New-Item -ItemType Directory -Force .agents/skills
Copy-Item -Recurse "C:\Users\Admin\Desktop\website-fidelity-cloner" ".agents\skills\website-fidelity-cloner"
~~~

Se não aparecer no seletor de skills, reinicie a sessão do Codex. Exemplo de pedido: “Use website-fidelity-cloner para replicar https://example.com em React editável, com benchmark e QA”.

## Instalação no Claude Code

~~~text
<seu-repo>/.claude/skills/website-fidelity-cloner/SKILL.md
~/.claude/skills/website-fidelity-cloner/SKILL.md
~~~

No Windows:

~~~powershell
New-Item -ItemType Directory -Force .claude/skills
Copy-Item -Recurse "C:\Users\Admin\Desktop\website-fidelity-cloner" ".claude\skills\website-fidelity-cloner"
~~~

No Claude Code, invoque /website-fidelity-cloner ou peça naturalmente “reconstrua este site com fidelidade e componentes editáveis”. Para Claude.ai com suporte a skills por upload, gere um ZIP que contenha SKILL.md na raiz da pasta e siga o fluxo de upload do produto.

## Publicar como repositório Git

Você pode publicar o CONTEÚDO desta pasta em um repositório próprio. Recomendação: mantenha a pasta raiz do repositório com SKILL.md, README.md, scripts/, references/ e examples/. Depois, para instalar via pasta local, copie o repositório para uma das localizações acima.

~~~bash
git init
git add .
git commit -m "feat: portable website fidelity cloner skill"
~~~

Não inclua screenshots, HTML, CSS, assets/fontes ou scripts proprietários obtidos de terceiros no repositório público. A skill inclui apenas método, scripts genéricos e um estudo de caso documental.

Para gerar um ZIP instalável, com caminhos padronizados para Windows/macOS/Linux:

~~~bash
python scripts/build_zip.py --output ../website-fidelity-cloner.zip
~~~

Antes de tornar o repositório público, escolha uma licença para sua autoria.
Incluímos LICENSE.template (MIT opcional) para você revisar, preencher o titular
e renomear para LICENSE. Licenças de outras skills e ativos de terceiros são
independentes.

## Requisitos

- Python 3.10+; os scripts genéricos de captura, verificação e extração usam a
  biblioteca padrão e **não exigem requests**. Os scripts específicos do caso
  Ulls/Kirvano em examples/ usam requests.
- Node.js 20+ e npm para a reconstrução React/Vite.
- Navegador Chromium/Chrome para testes visuais.
- Para o script opcional de QA automatizado: npm install no diretório da skill (playwright-core) e Chrome local/remote debugging.
- Git recomendado. O pipeline funciona melhor quando o site tem HTML SSR e seus recursos são publicamente acessíveis.

## Mapa dos arquivos

| Arquivo | Função |
| --- | --- |
| SKILL.md | Instruções que o agente deve executar |
| references/WORKFLOW.md | Manual fase a fase com gates |
| references/TOOLSTACK.md | Skills e ferramentas usadas/consultadas |
| references/COMPONENTS.md | Estrutura editável e catálogos de conteúdo |
| references/MOTION.md | Recuperação de animações reais |
| references/QA.md | Protocolo de medição e aprovação |
| references/TROUBLESHOOTING.md | Bugs reais resolvidos |
| references/SAFETY-AND-RIGHTS.md | Limites e proteção de dados/licenças |
| scripts/ | Ferramentas independentes e adaptáveis |
| examples/ULLS-KIRVANO.md | História técnica detalhada do caso de origem |
| examples/original-pipeline-scripts/ | Scripts realmente usados, **específicos** do caso Ulls/Kirvano |

## Primeiro uso recomendado

Leia SKILL.md, depois peça à IA:

> Clone visualmente o site público [URL] em uma referência imutável, identifique e extraia suas seções sem alterar a geometria, reconstrua em React/Vite editável com conteúdo centralizado, reimplemente as animações importantes e valide desktop/tablet/mobile no navegador. Não publique nem conecte formulários reais.

Esta skill **não declara que qualquer site será 100% copiável automaticamente**. Ela força inspeção, testes e uma entrega honesta mesmo em casos com WebGL, SaaS fechado ou embeds externos.
