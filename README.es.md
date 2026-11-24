# HTML Creator

[Read in English](README.md)

Convierte una guía, un documento, una página web o una idea suelta en un único archivo HTML listo para publicar tal cual. Primero te hace unas preguntas, escribe la página y luego te deja cambiarla hablando con ella.

Puedes usarlo de dos formas:

- **En la IA de chat que ya usas, sin clave de API:** una skill para Claude o un archivo de instrucciones para ChatGPT, Gemini u otra. Te basta con el plan que ya tienes.
- **Como app en tu ordenador**, con tu propia clave de API de Claude o de OpenAI: ventana propia, vista previa en directo, versiones y adjuntos.

Las dos siguen las mismas reglas, así que las páginas salen parecidas.

## En tu IA de chat (sin clave de API)

**Claude (claude.ai)**

1. Descarga **[html-creator.zip](https://github.com/bfktrick/HTML-easy-creator/releases/latest/download/html-creator.zip)**.
2. En los ajustes de Claude, ve al apartado de skills y sube el `.zip`.
3. En un chat nuevo, dale tu material: «Hazme una página con esta guía».

**Claude Code:** descomprime `html-creator.zip` en `~/.claude/skills/` (en Windows, `C:\Users\<tu usuario>\.claude\skills\`) y pídele una página.

**ChatGPT, Gemini o cualquier otra IA:** descarga **[HTML-Creator-agente.md](https://github.com/bfktrick/HTML-easy-creator/releases/latest/download/HTML-Creator-agente.md)**, adjúntalo a un chat (o añádelo a un proyecto, un GPT personalizado o un Gem) y escribe «Sigue estas instrucciones».

La carpeta [`agente/`](agente/LEEME.md) explica cada opción paso a paso, cómo guardar la página y en qué se diferencia de la app.

## La app (con tu clave de API)

Una pequeña app de chat que funciona en tu ordenador. Habla directamente con Anthropic u OpenAI usando tu clave; nada pasa por servidores de terceros.

### Qué hace

- **Cuatro tipos de página:** documentos y guías, landings de una sola página, presentaciones (flechas del teclado, pantalla completa, una diapositiva por hoja al imprimir) y pequeñas herramientas interactivas como calculadoras, listas de comprobación o cuestionarios. En «Automático» elige el tipo según lo que le des.
- **Varias formas de empezar:** pega un texto o un enlace, describe una idea o adjunta archivos PDF, Word (.docx), Markdown o de texto e imágenes. Tus imágenes pueden salir en la página.
- **Preguntas antes de escribir:** de dos a cuatro preguntas cortas (para quién es, el estilo, datos que faltan), con respuestas para hacer clic. «Saltar preguntas» va directo a la página.
- **Cambios por chat:** «pon el título más grande», «añade una sección de precios». Solo cambia la parte que dices; el resto de la página se queda como estaba.
- **Versiones:** se guardan la página y cada cambio. Puedes volver a cualquier versión o deshacer el último cambio con un clic, también después de recargar.
- **Un solo archivo:** el CSS, los scripts, los dibujos y tus imágenes van dentro del `.html`. Sin fuentes, scripts ni imágenes externas.
- Interfaz en **español e inglés**.

### Qué necesitas

- [Node.js](https://nodejs.org/) 22.18 o posterior
- [pnpm](https://pnpm.io/installation) 11
- Una clave de API de [Anthropic](https://console.anthropic.com/) o de [OpenAI](https://platform.openai.com/api-keys)

### Instalar y arrancar

```sh
git clone https://github.com/bfktrick/HTML-easy-creator.git
```

**Windows:** abre la carpeta y haz doble clic en **`HTML Creator.cmd`**. La primera vez instala lo que necesita y tarda un minuto; después se abre en unos segundos. La app tiene su propia ventana, con el chat a la izquierda y la vista previa a la derecha, y al cerrarla se apaga. La ventana la dibuja Edge, Chrome o Brave (el que tengas), sin pestañas ni barra de direcciones.

**macOS, Linux o desde un terminal:**

```sh
cd HTML-easy-creator
pnpm install
pnpm app     # en su propia ventana
pnpm start   # o en tu navegador de siempre
```

Las dos sirven la app en `http://127.0.0.1:4800`. La primera vez, entra en **Ajustes**, pega tu clave y elige un modelo.

### Cómo se usa

1. Pega tu material o un enlace, o describe lo que quieres. También puedes adjuntar archivos.
2. Responde a las preguntas o pulsa «Saltar preguntas».
3. Mira cómo aparece la página en la vista previa de la derecha.
4. Pide cambios en el chat. Con **Versiones** vuelves atrás.
5. Pulsa **Descargar** para guardar el `.html` y súbelo a cualquier sitio que sirva archivos estáticos.

### Cuánto cuesta

La app es gratis. Cada página la cobra tu proveedor de IA a tu clave. Una página larga con un modelo de gama alta y razonamiento alto suele quedarse bastante por debajo de un euro; los cambios por chat cuestan mucho menos porque solo se escribe la parte que cambia.

## Privacidad y seguridad (app)

- Tu clave se guarda en tu ordenador, fuera de la carpeta del proyecto (`%APPDATA%\html-creator` en Windows, `~/Library/Application Support/html-creator` en macOS y `~/.config/html-creator` en Linux). Con `HTML_CREATOR_CONFIG_DIR` puedes usar otra carpeta.
- El servidor local solo escucha en `127.0.0.1` y rechaza peticiones de otras webs.
- La vista previa ejecuta la página en un marco aislado: no puede leer la app ni tu clave.
- El lector de enlaces no abre direcciones de tu ordenador ni de tu red local.
- Lo que pegas o adjuntas se envía al proveedor de IA que elegiste, y a nadie más.

## Opciones

| Variable | Por defecto | Para qué sirve |
| --- | --- | --- |
| `PORT` | `4800` | Puerto del servidor local |
| `HTML_CREATOR_NO_OPEN` | sin definir | Ponla a `1` para que no abra el navegador |
| `HTML_CREATOR_CONFIG_DIR` | ver arriba | Carpeta donde se guardan los ajustes y la clave |

## Desarrollo

```sh
pnpm dev         # servidor y cliente con recarga en caliente
pnpm test        # tests unitarios (Vitest)
pnpm typecheck
pnpm agent       # vuelve a generar agente/ con las reglas de la app
```

El cliente es React + TypeScript (Vite) y el servidor una pequeña app de [Hono](https://hono.dev/). Los dos hablan con los SDK oficiales de Anthropic y OpenAI a través de una capa común.

Si cambias las reglas, ejecuta `pnpm agent` y adjunta a una release nueva un `html-creator.zip` recién hecho (la carpeta `agente/html-creator`) y `HTML-Creator-agente.md`, para que los enlaces de descarga de arriba sirvan la versión nueva.

## Licencia

[MIT](LICENSE)
