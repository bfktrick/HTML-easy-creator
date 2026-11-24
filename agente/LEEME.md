# HTML Creator sin clave de API

[Read in English](README.md)

Esta carpeta convierte la IA de chat que ya usas (Claude, ChatGPT, Gemini u otra) en HTML Creator. Le das tu texto, un documento, un enlace o una idea; te hace unas preguntas, escribe la página en un solo archivo HTML y la cambia cuando se lo pides. Sigue las mismas reglas que la app.

Hay dos formas del mismo contenido:

- **`HTML-Creator-agente.md`**: el archivo para cualquier IA de chat.
- **`html-creator/`**: lo mismo como skill, para Claude y Claude Code.

## Cómo usarlo

**Claude (claude.ai)**

- En un proyecto: crea un proyecto y pega el contenido de `HTML-Creator-agente.md` en sus instrucciones, o añade el archivo a sus conocimientos. Luego abre un chat dentro del proyecto.
- Como skill: comprime la carpeta `html-creator` en un `.zip` y súbela como skill en los ajustes de Claude.

**ChatGPT**

- En un proyecto o en un GPT personalizado: añade `HTML-Creator-agente.md` como archivo y escribe en las instrucciones `Follow HTML-Creator-agente.md`.
- O adjúntalo a un chat y escribe «Sigue estas instrucciones».

**Gemini**

- Crea un Gem, añade `HTML-Creator-agente.md` como archivo y escribe en sus instrucciones `Follow HTML-Creator-agente.md`.

**Cualquier otra IA**

- Adjunta `HTML-Creator-agente.md` (o pega su contenido) y escribe «Sigue estas instrucciones».

**Claude Code**

- Copia la carpeta `html-creator` en `~/.claude/skills/` (en Windows, `C:\Users\<tu usuario>\.claude\skills\`). Después pídele una página con tu material.

## Guardar la página

Copia todo el código de la página en un archivo cuyo nombre termine en `.html` (por ejemplo `mi-pagina.html`) y ábrelo con el navegador. Ese archivo es la página: puedes subirlo a cualquier sitio que sirva archivos estáticos.

## En qué se diferencia de la app

- Solo ves la página dentro del chat si tu IA la muestra (los artefactos de Claude o el lienzo de ChatGPT). Si no, la ves al abrir el archivo en el navegador.
- En cada cambio la IA vuelve a escribir el archivo entero. Tarda más que la app, y en una página larga la respuesta puede quedarse a medias: escribe «sigue» y continúa donde lo dejó.
- Las versiones van numeradas en el chat («Versión 2»). Para volver a una, pídela por su número.
- Tus fotos y tu logo no van dentro del archivo: la página los llama por su nombre (`logo.png`), así que guárdalos en la misma carpeta que el `.html`.
