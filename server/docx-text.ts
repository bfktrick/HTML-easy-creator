// Word files become text for the source. mammoth turns the .docx into simple HTML (its
// Markdown output is deprecated), and this file turns that HTML into Markdown-like text the
// model reads well: headings, lists, tables and links survive; images are left out.

import mammoth from 'mammoth';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
// mammoth's HTML is flat and well formed: one pass over its tags and text is enough.
const TOKEN = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|([^<]+)/g;
const HEADING = /^h([1-6])$/;

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? entity;
    const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });
}

function attribute(attributes: string, name: string): string {
  return decode(new RegExp(`\\b${name}="([^"]*)"`).exec(attributes)?.[1] ?? '');
}

function tidy(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .trim();
}

/** mammoth's HTML as Markdown-like text. */
export function docxHtmlToText(html: string): string {
  const blocks: string[] = [];
  let line = '';
  let prefix = '';
  const lists: { ordered: boolean; count: number }[] = [];
  const links: (string | null)[] = [];
  let row: string[] | null = null;
  let cell: string | null = null;

  const write = (text: string) => {
    if (cell !== null) cell += text;
    else line += text;
  };
  const endBlock = (gap: boolean) => {
    const text = tidy(line);
    if (text) blocks.push(prefix + text);
    if (gap) blocks.push('');
    line = '';
    prefix = '';
  };

  for (const [, closing, rawName, attributes, text] of html.matchAll(TOKEN)) {
    if (text !== undefined) {
      write(decode(text));
      continue;
    }
    const name = rawName.toLowerCase();
    const heading = HEADING.exec(name);
    if (heading) {
      endBlock(Boolean(closing));
      if (!closing) prefix = `${'#'.repeat(Number(heading[1]))} `;
      continue;
    }
    switch (name) {
      case 'p':
        // Paragraphs inside a list item or a table cell are part of that item or cell.
        if (closing && cell !== null) write(' ');
        else if (closing && lists.length === 0) endBlock(true);
        break;
      case 'br':
        write(cell !== null ? ' ' : '\n');
        break;
      case 'ul':
      case 'ol':
        endBlock(false);
        if (!closing) lists.push({ ordered: name === 'ol', count: 0 });
        else if (lists.pop() && lists.length === 0) blocks.push('');
        break;
      case 'li': {
        endBlock(false);
        const list = lists.at(-1);
        if (!closing && list) {
          list.count += 1;
          prefix = '  '.repeat(lists.length - 1) + (list.ordered ? `${list.count}. ` : '- ');
        }
        break;
      }
      case 'table':
        endBlock(false);
        if (closing) blocks.push('');
        break;
      case 'tr':
        if (!closing) row = [];
        else if (row) {
          blocks.push(`| ${row.join(' | ')} |`);
          row = null;
        }
        break;
      case 'td':
      case 'th':
        if (!closing) cell = '';
        else if (cell !== null) {
          row?.push(tidy(cell).replace(/\|/g, '\\|'));
          cell = null;
        }
        break;
      case 'strong':
      case 'b':
        write('**');
        break;
      case 'em':
      case 'i':
        write('*');
        break;
      case 'a':
        if (!closing) {
          // Bookmarks and footnote anchors point inside the document: keep only their text.
          const href = attribute(attributes, 'href');
          const external = href !== '' && !href.startsWith('#');
          links.push(external ? href : null);
          if (external) write('[');
        } else {
          const href = links.pop();
          if (href) write(`](${href})`);
        }
        break;
      case 'img': {
        const alt = attribute(attributes, 'alt').trim();
        if (alt) write(`[image: ${alt}]`);
        break;
      }
    }
  }
  endBlock(false);
  return blocks.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** The text of a .docx file. Throws if it is not a readable Word document. */
export async function docxToText(file: Buffer): Promise<string> {
  // Pictures are not material the model can use as text, and decoding them costs memory.
  const convertImage = mammoth.images.imgElement(async () => ({ src: '' }));
  const result = await mammoth.convertToHtml({ buffer: file }, { convertImage });
  return docxHtmlToText(result.value);
}
