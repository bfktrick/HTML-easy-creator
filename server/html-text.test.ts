import { describe, expect, it } from 'vitest';
import { htmlToText } from './html-text.ts';

const PAGE = 'https://example.com/guias/huerto.html';

function page(body: string, head = '<title>Huerto urbano</title>') {
  return `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
}

describe('htmlToText', () => {
  it('keeps the structure of the main content', () => {
    const { title, text } = htmlToText(
      page(`
        <header><a href="/">Inicio</a> <nav><a href="/blog">Blog</a></nav></header>
        <main>
          <h1>Cómo  empezar
            un huerto</h1>
          <p>Necesitas <strong>sol</strong> y&nbsp;paciencia &amp; agua.</p>
          <ul>
            <li>Tomates
              <ul><li>Cherry</li><li>Pera</li></ul>
            </li>
            <li>Lechugas</li>
          </ul>
          <h2>Calendario</h2>
          <table>
            <thead><tr><th>Mes</th><th>Qué plantar</th></tr></thead>
            <tbody><tr><td>Marzo</td><td>Habas</td></tr></tbody>
          </table>
          <p>Más en <a href="riego.html">la guía de riego</a> o escribe a <a href="mailto:hola@example.com">hola@example.com</a>.</p>
          <p><img src="a.jpg" alt="Bancal elevado"> Línea uno<br>Línea dos</p>
        </main>
        <aside>Publicidad</aside>
        <footer>© 2026</footer>
      `),
      PAGE,
    );
    expect(title).toBe('Huerto urbano');
    expect(text).toBe(
      [
        '# Cómo empezar un huerto',
        'Necesitas sol y paciencia & agua.',
        '- Tomates\n  - Cherry\n  - Pera\n- Lechugas',
        '## Calendario',
        'Mes | Qué plantar\nMarzo | Habas',
        'Más en la guía de riego (https://example.com/guias/riego.html) o escribe a hola@example.com.',
        '[Bancal elevado] Línea uno\nLínea dos',
      ].join('\n\n'),
    );
  });

  it('drops scripts, styles, forms, menus and hidden parts', () => {
    const { text } = htmlToText(
      page(`
        <script>var secret = 1;</script><style>p { color: red }</style><noscript>Activa JS</noscript>
        <template><p>Plantilla</p></template><svg><text>Gráfico</text></svg>
        <div role="navigation">Menú</div><div role="banner">Cabecera</div>
        <form><label>Email <input name="e"></label><button>Enviar</button></form>
        <p hidden>Oculto</p><p aria-hidden="true">Decorativo</p><p style="display: none">Nada</p>
        <dialog>Aceptar cookies</dialog>
        <p>Lo que importa.</p>
      `),
      PAGE,
    );
    expect(text).toBe('Lo que importa.');
  });

  it('drops long lists made only of links, but keeps short ones and lists with text', () => {
    const languages = Array.from({ length: 10 }, (_, i) => `<li><a href="/l${i}">Idioma ${i}</a></li>`).join('');
    const steps = Array.from({ length: 10 }, (_, i) => `<li>Paso ${i}: mezcla con <a href="/h">la harina</a></li>`).join('');
    const { text } = htmlToText(
      `<main><h1>Pan</h1><ul>${languages}</ul><ol>${steps}</ol><ul><li><a href="/a">Ver también</a></li></ul></main>`,
      'https://example.com/',
    );
    expect(text).not.toContain('Idioma 3');
    expect(text).toContain('Paso 3: mezcla con la harina');
    expect(text).toContain('Ver también');
  });

  it('prefers the only article, keeping its own header', () => {
    const { text } = htmlToText(
      page(`
        <header>Mi blog</header>
        <div class="layout">
          <article><header><h1>Receta</h1><p>Por Ana</p></header><p>Mezcla todo.</p><footer>Etiquetas: cocina</footer></article>
          <aside><article><h2>Otra receta</h2></article></aside>
        </div>
        <footer>Contacto</footer>
      `),
      PAGE,
    );
    expect(text).toBe('# Receta\n\nPor Ana\n\nMezcla todo.\n\nEtiquetas: cocina');
  });

  it('uses the whole body when there are several articles, without the page chrome', () => {
    const { text } = htmlToText(
      page(`<header>Logo</header><article><h2>Uno</h2></article><article><h2>Dos</h2></article><footer>Pie</footer>`),
      PAGE,
    );
    expect(text).toBe('## Uno\n\n## Dos');
  });

  it('falls back to the body when <main> is empty', () => {
    const { text } = htmlToText(page('<main></main><div><p>Contenido real</p></div>'), PAGE);
    expect(text).toBe('Contenido real');
  });

  it('resolves links against <base> and skips in-page and script links', () => {
    const { text } = htmlToText(
      page(
        '<p><a href="docs/a">A</a> <a href="#top">Arriba</a> <a href="javascript:void(0)">JS</a> <a href="https://example.org/">https://example.org/</a></p>',
        '<base href="https://cdn.example.net/root/"><title>T</title>',
      ),
      PAGE,
    );
    expect(text).toBe('A (https://cdn.example.net/root/docs/a) Arriba JS https://example.org/');
  });

  it('keeps the spacing of <pre> blocks', () => {
    const { text } = htmlToText(page('<p>Ejemplo:</p><pre>\nif (x) {\n  y();\n}\n</pre>'), PAGE);
    expect(text).toBe('Ejemplo:\n\nif (x) {\n  y();\n}');
  });

  it('finds a title when <title> is missing', () => {
    expect(htmlToText(page('<p>x</p>', '<meta property="og:title" content="Desde OG">'), PAGE).title).toBe('Desde OG');
    expect(htmlToText(page('<h1>Desde el <em>h1</em></h1>', ''), PAGE).title).toBe('Desde el h1');
    expect(htmlToText(page('<p>x</p>', ''), PAGE).title).toBe('');
  });

  it('copes with broken markup and pages without text', () => {
    expect(htmlToText('<p>Uno<p>Dos<li>Tres', PAGE).text).toBe('Uno\n\nDos\n\n- Tres');
    expect(htmlToText(page('<div id="root"></div><script src="app.js"></script>'), PAGE).text).toBe('');
    expect(htmlToText('', PAGE).text).toBe('');
  });
});
