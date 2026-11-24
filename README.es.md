# HTML Creator

[Read in English](README.md)

Una pequeña app de chat que funciona en tu ordenador y convierte una guía, un documento, una página web o una idea suelta en un único archivo HTML listo para publicar tal cual. Primero te hace unas preguntas, escribe la página mientras la ves y luego te deja cambiarla hablando con ella.

Usa tu propia clave de Claude (Anthropic) o de OpenAI. Nada pasa por servidores de terceros.

## Qué hace

- **Cuatro tipos de página:** documentos y guías, landings de una sola página, presentaciones (flechas del teclado, pantalla completa, una diapositiva por hoja al imprimir) y pequeñas herramientas interactivas como calculadoras, listas de comprobación o cuestionarios. En «Automático» elige el tipo según lo que le des.
- **Varias formas de empezar:** pega un texto o un enlace, describe una idea o adjunta archivos PDF, Word (.docx), Markdown o de texto e imágenes. Tus imágenes pueden salir en la página.
- **Preguntas antes de escribir:** de dos a cuatro preguntas cortas (para quién es, el estilo, datos que faltan), con respuestas para hacer clic. «Saltar preguntas» va directo a la página.
- **Cambios por chat:** «pon el título más grande», «añade una sección de precios». Solo cambia la parte que dices; el resto de la página se queda como estaba.
- **Versiones:** se guardan la página y cada cambio. Puedes volver a cualquier versión o deshacer el último cambio con un clic, también después de recargar.
- **Un solo archivo:** el CSS, los scripts, los dibujos y tus imágenes van dentro del `.html`. Sin fuentes, scripts ni imágenes externas.
- Interfaz en **español e inglés**.

## Qué necesitas

- [Node.js](https://nodejs.org/) 22.18 o posterior
- [pnpm](https://pnpm.io/installation) 11
- Una clave de API de [Anthropic](https://console.anthropic.com/) o de [OpenAI](https://platform.openai.com/api-keys)

## Instalar y arrancar

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

## Cómo se usa

1. Pega tu material o un enlace, o describe lo que quieres. También puedes adjuntar archivos.
2. Responde a las preguntas o pulsa «Saltar preguntas».
3. Mira cómo aparece la página en la vista previa de la derecha.
4. Pide cambios en el chat. Con **Versiones** vuelves atrás.
5. Pulsa **Descargar** para guardar el `.html` y súbelo a cualquier sitio que sirva archivos estáticos.

## Cuánto cuesta

La app es gratis. Cada página la cobra tu proveedor de IA a tu clave. Una página larga con un modelo de gama alta y razonamiento alto suele quedarse bastante por debajo de un euro; los cambios por chat cuestan mucho menos porque solo se escribe la parte que cambia.

## Sin clave de API

Si no tienes clave, puedes sacar las mismas páginas de la IA de chat que ya pagas (Claude, ChatGPT, Gemini u otra) o de Claude Code. La carpeta [`agente/`](agente/LEEME.md) trae un archivo de instrucciones que hace que la IA te haga las preguntas, escriba la página con las mismas reglas que la app y la cambie por chat. Allí se explica cómo usarlo en cada una.

## Privacidad y seguridad

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

## Licencia

[MIT](LICENSE)
