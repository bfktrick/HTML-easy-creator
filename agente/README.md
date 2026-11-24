# HTML Creator without an API key

[Leer en español](LEEME.md)

This folder turns the chat AI you already use (Claude, ChatGPT, Gemini or another) into HTML Creator. Give it your text, a document, a link or an idea; it asks a few questions, writes the page as one HTML file and changes it when you ask. It follows the same rules as the app.

The same content comes in two forms:

- **`HTML-Creator-agente.md`**: the file for any chat AI.
- **`html/`**: the same as a skill, for Claude and Claude Code. You call it with `/html`.

## How to use it

**Claude (claude.ai)**

- In a project: create a project and paste the content of `HTML-Creator-agente.md` into its instructions, or add the file to its knowledge. Then open a chat inside the project.
- As a skill: download [html-creator.zip](https://github.com/bfktrick/HTML-easy-creator/releases/latest/download/html-creator.zip) (or compress the `html` folder yourself), open **Plugins** in Claude's left sidebar, press **Upload plugin** and choose the `.zip`. Then start your message with `/html`: "/html Make a page from this guide: …".

**ChatGPT**

- In a project or a custom GPT: add `HTML-Creator-agente.md` as a file and write `Follow HTML-Creator-agente.md` in the instructions.
- Or attach it to a chat and write "Follow these instructions".

**Gemini**

- Create a Gem, add `HTML-Creator-agente.md` as a file and write `Follow HTML-Creator-agente.md` in its instructions.

**Any other AI**

- Attach `HTML-Creator-agente.md` (or paste its content) and write "Follow these instructions".

**Claude Code**

- Copy the `html` folder into `~/.claude/skills/` (on Windows, `C:\Users\<your user>\.claude\skills\`), or unzip `html-creator.zip` there. Then type `/html` with your material.

## Saving the page

Copy all of the page's code into a file whose name ends in `.html` (for example `my-page.html`) and open it with your browser. That file is the page: you can upload it anywhere that serves static files.

## How it differs from the app

- You only see the page inside the chat if your AI shows it (Claude's artifacts or ChatGPT's canvas). Otherwise you see it when you open the file in your browser.
- On every change the AI writes the whole file again. It takes longer than the app, and on a long page the reply may stop halfway: write "continue" and it picks up where it stopped.
- Versions are numbered in the chat ("Version 2"). To go back to one, ask for it by its number.
- Your photos and logo do not go inside the file: the page points to them by name (`logo.png`), so keep them in the same folder as the `.html`.
