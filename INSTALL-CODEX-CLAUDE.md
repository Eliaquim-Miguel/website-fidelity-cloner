# Instalar no Codex ou Claude Code

O nome interno da skill é **website-fidelity-cloner** e deve corresponder ao nome da pasta que contém o SKILL.md.

## Instalação por projeto — Codex

~~~text
seu-repositorio/
  .agents/
    skills/
      website-fidelity-cloner/
        SKILL.md
        references/
        scripts/
        templates/
        examples/
~~~

Exemplo PowerShell dentro do repositório:

~~~powershell
New-Item -ItemType Directory -Force .agents/skills
Copy-Item -Recurse -Force "C:\Users\Admin\Desktop\website-fidelity-cloner" ".agents\skills\website-fidelity-cloner"
~~~

Reabra/reinicie o Codex se a skill não aparecer. Pergunte: “Use website-fidelity-cloner para reconstruir o site https://example.com com componentes editáveis, benchmark e QA”.

## Instalação por projeto — Claude Code

~~~text
seu-repositorio/
  .claude/
    skills/
      website-fidelity-cloner/
        SKILL.md
        references/
        scripts/
        templates/
        examples/
~~~

~~~powershell
New-Item -ItemType Directory -Force .claude/skills
Copy-Item -Recurse -Force "C:\Users\Admin\Desktop\website-fidelity-cloner" ".claude\skills\website-fidelity-cloner"
~~~

Em Claude Code, invoque **/website-fidelity-cloner** quando a skill estiver disponível na sua versão/instalação. Também pode pedir pelo nome no prompt.

## Instalação no usuário inteiro

- Codex: ~/.agents/skills/website-fidelity-cloner/
- Claude Code: ~/.claude/skills/website-fidelity-cloner/

A pasta deve conter SKILL.md diretamente, sem diretório extra dentro de website-fidelity-cloner. No Windows, ~ é a pasta do usuário.

## ZIP para compartilhar ou importar

Use o ZIP criado junto da pasta da skill, ou compacte a pasta completa incluindo SKILL.md, references/, scripts/ e templates/.

- Em outro PC: extraia e copie para a localização do agente.
- Em Claude.ai com suporte ao upload de skills, use o fluxo de upload oferecido pelo produto e o ZIP em formato aceito.
- Em qualquer IA sem Agent Skills: passe SKILL.md e os arquivos de references/ como contexto; o agente ainda precisa de acesso a navegador/shell/arquivos para executar.

## Passo de teste após instalar

1. Abra repo de teste limpo e autorizado.
2. Solicite: “use website-fidelity-cloner apenas para auditar https://example.com, sem editar código”.
3. Veja se ele leu referências e gerou inventário/medidas.
4. Autorize/solicite benchmark + app editável.
5. Confira scripts com --help, npm run build e QA browser.
6. Não rode download/captura contra websites privados ou sem direito de uso.

## Publicação em Git

Padrão recomendado:

~~~text
github.com/SEU-USUARIO/website-fidelity-cloner
  SKILL.md
  README.md
  INSTALL-CODEX-CLAUDE.md
  references/
  scripts/
  templates/
  examples/
  LICENSE.template
  .gitignore
~~~

Antes do primeiro push, revise LICENSE.template e substitua pelo LICENSE escolhido por você. Não inclua snapshots/cookies/assets de terceiros.

Documentação oficial:
- https://learn.chatgpt.com/docs/build-skills
- https://docs.claude.com/en/docs/claude-code/skills
- https://agentskills.io
