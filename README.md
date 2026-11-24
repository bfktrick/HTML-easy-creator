# HTML Creator

[Leer en español](README.es.md)

Turns a guide, a document, a web page or a rough idea into a single HTML file you can publish as it is. It asks a few questions first, writes the page, and then lets you change it by chatting.

You can use it in two ways:

- **In the AI chat you already use, with no API key:** a skill for Claude, or an instructions file for ChatGPT, Gemini or any other. Your current plan covers it.
- **As an app on your computer**, with your own Claude or OpenAI API key: a window of its own, a live preview, versions and attachments.

Both follow the same rules, so the pages come out alike.

## In your AI chat (no API key)

**Claude (claude.ai)**

1. Download **[html-creator.zip](https://github.com/bfktrick/HTML-easy-creator/releases/latest/download/html-creator.zip)**.
2. In Claude, open **Plugins** in the left sidebar, press **Upload plugin** and choose the `.zip`.
3. In a new chat, write **`/html`** followed by your material: "/html Make a page from this guide: …". Claude may also pick it by itself when you ask for a page, but `/html` makes sure.

**Claude Code:** unzip `html-creator.zip` into `~/.claude/skills/` (on Windows, `C:\Users\<your user>\.claude\skills\`). It creates an `html` folder. Then type `/html` with your material.

**ChatGPT, Gemini or any other AI:** download **[HTML-Creator-agente.md](https://github.com/bfktrick/HTML-easy-creator/releases/latest/download/HTML-Creator-agente.md)**, attach it to a chat (or add it to a project, a custom GPT or a Gem) and write "Follow these instructions".

The [`agente/`](agente/README.md) folder explains each option step by step, how to save the page and how it differs from the app.

## The app (with your API key)

A small chat app that runs on your own computer. It talks straight to Anthropic or OpenAI with your own key; nothing goes through anyone else's server.

### What it does

- **Four kinds of page:** documents and guides, one-page landing pages, slide presentations (arrow keys, full screen, one slide per printed page) and small interactive tools such as calculators, checklists or quizzes. Leave it on "Automatic" and it picks one from what you give it.
- **Many ways in:** paste text, paste a link, describe an idea, or attach PDF, Word (.docx), Markdown or text files and images. Your images can appear on the page.
- **Questions before writing:** two to four short questions (who it is for, the look, missing facts), with clickable answers. "Skip questions" goes straight to the page.
- **Changes by chat:** "make the title bigger", "add a section about prices". Only the part you mention changes; the rest of the page stays as it was.
- **Versions:** every page and every change is kept. Go back to any version, or undo the last change with one click. They survive a page reload.
- **One self-contained file:** CSS, scripts, drawings and your images all live inside the `.html`. No external fonts, scripts or images.
- **Spanish and English** interface.

### Requirements

- [Node.js](https://nodejs.org/) 22.18 or newer
- [pnpm](https://pnpm.io/installation) 11
- An API key from [Anthropic](https://console.anthropic.com/) or [OpenAI](https://platform.openai.com/api-keys)

### Install and run

```sh
git clone https://github.com/bfktrick/HTML-easy-creator.git
```

**Windows:** open the folder and double-click **`HTML Creator.cmd`**. The first time it installs what it needs, which takes a minute; after that it opens in a few seconds. The app gets a window of its own, with the chat on the left and the preview on the right, and closing that window stops it. The window is drawn by Edge, Chrome or Brave (whichever you have), without tabs or an address bar.

**macOS, Linux or a terminal:**

```sh
cd HTML-easy-creator
pnpm install
pnpm app     # in a window of its own
pnpm start   # or in your usual browser
```

Both serve the app at `http://127.0.0.1:4800`. The first time, open **Settings**, paste your key and choose a model.

### How to use it

1. Paste your material, a link, or describe what you want. You can also attach files.
2. Answer the questions, or press "Skip questions".
3. Watch the page appear in the preview on the right.
4. Ask for changes in the chat. Use **Versions** to go back.
5. Press **Download** to save the `.html` file. Upload it anywhere that serves static files.

### What it costs

The app is free. Each page is billed by your AI provider to your key. A long page with a top model at high effort is usually well under one euro; changes by chat cost much less because only the edited parts are written.

## Privacy and security (app)

- Your key is stored on your computer, outside the project folder (`%APPDATA%\html-creator` on Windows, `~/Library/Application Support/html-creator` on macOS, `~/.config/html-creator` on Linux). Set `HTML_CREATOR_CONFIG_DIR` to use another folder.
- The local server only listens on `127.0.0.1` and refuses requests from other sites.
- The preview runs the generated page in an isolated frame: it cannot read the app or your key.
- The link reader refuses addresses on your computer or your local network.
- What you paste or attach is sent to the AI provider you chose, and to no one else.

## Options

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `4800` | Port of the local server |
| `HTML_CREATOR_NO_OPEN` | not set | Set to `1` so it does not open the browser |
| `HTML_CREATOR_CONFIG_DIR` | see above | Folder where settings and the key are kept |

## Development

```sh
pnpm dev         # server and client with hot reload
pnpm test        # unit tests (Vitest)
pnpm typecheck
pnpm agent       # rebuild agente/ from the app's rules
```

The client is React + TypeScript (Vite), the server is a small [Hono](https://hono.dev/) app, and both talk to the official Anthropic and OpenAI SDKs through one common layer.

After changing the rules, run `pnpm agent` and attach a fresh `html-creator.zip` (the `agente/html` folder, with the folder itself at the root of the zip) and `HTML-Creator-agente.md` to a new release, so the download links above serve the new version.

## License

[MIT](LICENSE)
