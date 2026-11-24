// Turns a web page into the plain text the AI reads: the main content with its
// structure (headings as "#", list items as "- ", table rows as "a | b"), without
// menus, footers, scripts or forms. parse5 builds the same tree a browser would,
// so broken markup and every named entity come out right.

import { parse, type DefaultTreeAdapterTypes as Tree } from 'parse5';

type Element = Tree.Element;
type ParentNode = Tree.ParentNode;

export interface PageText {
  title: string;
  text: string;
}

// Never content: code, styles, embedded objects, controls and dialogs (cookie banners).
const DROPPED = new Set([
  'script', 'style', 'noscript', 'template', 'svg', 'math', 'canvas', 'iframe', 'object', 'embed',
  'nav', 'aside', 'form', 'select', 'textarea', 'dialog', 'head',
]);
// The same parts of a page, marked with ARIA roles instead of tags.
const DROPPED_ROLES = new Set(['navigation', 'banner', 'contentinfo', 'complementary', 'search', 'dialog', 'alertdialog']);
// Inside these, <header> and <footer> belong to the content (an article's title and byline).
const SECTIONS = new Set(['main', 'article', 'section']);
const BLOCKS = new Set([
  'address', 'article', 'blockquote', 'body', 'center', 'dd', 'details', 'div', 'dl', 'dt', 'fieldset',
  'figcaption', 'figure', 'footer', 'header', 'hgroup', 'hr', 'legend', 'main', 'p', 'section', 'summary',
]);
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
// An article inside one of these is a teaser or related link, not the page's own article.
const NOT_THE_ARTICLE = new Set(['article', 'aside', 'nav', 'footer', 'header']);
const SVG = new Set(['svg']);

type BlockKind = 'para' | 'heading' | 'item' | 'row' | 'pre';

interface Block {
  kind: BlockKind;
  text: string;
}

function isElement(node: Tree.Node): node is Element {
  return 'tagName' in node;
}

function attr(element: Element, name: string): string | null {
  return element.attrs.find((a) => a.name === name)?.value ?? null;
}

function children(node: ParentNode): Tree.ChildNode[] {
  return node.childNodes;
}

function findAll(node: ParentNode, match: (element: Element) => boolean, out: Element[] = []): Element[] {
  for (const child of children(node)) {
    if (!isElement(child)) continue;
    if (match(child)) out.push(child);
    findAll(child, match, out);
  }
  return out;
}

function hasAncestor(element: Element, names: Set<string>): boolean {
  for (let node = element.parentNode; node && isElement(node); node = node.parentNode) {
    if (names.has(node.tagName)) return true;
  }
  return false;
}

/** Collapses whitespace; line breaks from <br> survive as "\n". */
function tidy(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '')
    .join('\n');
}

// A long list made only of links is a menu (languages, categories, "more from this site"),
// even when the page does not mark it as navigation.
const MENU_MIN_ITEMS = 8;
const MENU_LINK_SHARE = 0.9;

/** Characters of text under a node, and how many of them sit inside links. */
function textShare(node: ParentNode, inLink = false, out = { total: 0, linked: 0 }) {
  for (const child of children(node)) {
    if (isElement(child)) textShare(child, inLink || child.tagName === 'a', out);
    else if ('value' in child && child.nodeName === '#text') {
      const length = child.value.replace(/s+/g, '').length;
      out.total += length;
      if (inLink) out.linked += length;
    }
  }
  return out;
}

function isLinkMenu(list: Element): boolean {
  const items = children(list).filter((child) => isElement(child) && child.tagName === 'li').length;
  if (items < MENU_MIN_ITEMS) return false;
  const { total, linked } = textShare(list);
  return total > 0 && linked / total >= MENU_LINK_SHARE;
}

class PageWriter {
  readonly blocks: Block[] = [];
  private inline = '';
  private listDepth = 0;
  private itemDepth = 0;
  /** "- " (indented) waiting for the first text of the current list item. */
  private itemPrefix: string | null = null;
  private readonly base: string;

  constructor(base: string) {
    this.base = base;
  }

  private push(kind: BlockKind, text: string) {
    if (text !== '') this.blocks.push({ kind, text });
  }

  private flush() {
    const text = tidy(this.inline);
    this.inline = '';
    if (text === '') return;
    if (this.itemDepth > 0) {
      const indent = '  '.repeat(Math.max(0, this.listDepth - 1));
      const first = this.itemPrefix ?? `${indent}  `;
      this.itemPrefix = null;
      this.push('item', first + text.replace(/\n/g, `\n${indent}  `));
    } else {
      this.push('para', text);
    }
  }

  /** Whether an element is page chrome or hidden, and so left out with its content. */
  private dropped(element: Element, inSection: boolean): boolean {
    const name = element.tagName;
    if (DROPPED.has(name)) return true;
    if ((name === 'header' || name === 'footer') && !inSection) return true;
    const role = attr(element, 'role');
    if (role && DROPPED_ROLES.has(role.trim().toLowerCase())) return true;
    if (attr(element, 'hidden') !== null || attr(element, 'aria-hidden') === 'true') return true;
    if ((name === 'ul' || name === 'ol') && isLinkMenu(element)) return true;
    return /display\s*:\s*none/i.test(attr(element, 'style') ?? '');
  }

  /** Absolute address for a link, or null for in-page and script links. */
  private linkUrl(href: string): string | null {
    const raw = href.trim();
    if (raw === '' || raw.startsWith('#')) return null;
    try {
      const url = new URL(raw, this.base);
      return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  private link(element: Element, inSection: boolean): string {
    const text = this.inlineText(element, inSection);
    const href = attr(element, 'href');
    const url = href === null ? null : this.linkUrl(href);
    if (text === '' || url === null || text === url || `mailto:${text}` === url) return text;
    return `${text} (${url})`;
  }

  /** Everything inside an element as one line: for headings, links and table cells. */
  inlineText(node: ParentNode, inSection: boolean): string {
    let out = '';
    for (const child of children(node)) {
      if (child.nodeName === '#text') {
        out += (child as Tree.TextNode).value;
      } else if (isElement(child) && !this.dropped(child, inSection)) {
        if (child.tagName === 'img') out += ` ${imageText(child)} `;
        else if (child.tagName === 'a') out += this.link(child, inSection);
        else if (child.tagName === 'br' || BLOCKS.has(child.tagName) || HEADINGS.has(child.tagName)) {
          out += ` ${this.inlineText(child, inSection)} `;
        } else out += this.inlineText(child, inSection);
      }
    }
    return out.replace(/\s+/g, ' ').trim();
  }

  private table(table: Element, inSection: boolean) {
    const rows: Element[] = [];
    for (const child of children(table)) {
      if (!isElement(child)) continue;
      if (child.tagName === 'caption') this.push('para', this.inlineText(child, inSection));
      else if (child.tagName === 'tr') rows.push(child);
      else if (['thead', 'tbody', 'tfoot'].includes(child.tagName)) {
        for (const row of children(child)) if (isElement(row) && row.tagName === 'tr') rows.push(row);
      }
    }
    for (const row of rows) {
      const cells = children(row)
        .filter((cell): cell is Element => isElement(cell) && (cell.tagName === 'td' || cell.tagName === 'th'))
        .map((cell) => this.inlineText(cell, inSection))
        .filter((text) => text !== '');
      this.push('row', cells.join(' | '));
    }
  }

  walk(node: ParentNode, inSection: boolean) {
    for (const child of children(node)) {
      if (child.nodeName === '#text') {
        this.inline += (child as Tree.TextNode).value.replace(/\s+/g, ' ');
        continue;
      }
      if (!isElement(child) || this.dropped(child, inSection)) continue;
      const name = child.tagName;
      const nested = inSection || SECTIONS.has(name);

      if (name === 'br') {
        this.inline += '\n';
      } else if (name === 'img') {
        this.inline += ` ${imageText(child)} `;
      } else if (name === 'a') {
        this.inline += this.link(child, nested);
      } else if (HEADINGS.has(name)) {
        this.flush();
        const text = this.inlineText(child, nested);
        if (text !== '') this.push('heading', `${'#'.repeat(Number(name[1]))} ${text}`);
      } else if (name === 'ul' || name === 'ol' || name === 'menu') {
        this.flush();
        this.listDepth++;
        this.walk(child, nested);
        this.flush();
        this.listDepth--;
      } else if (name === 'li') {
        this.flush();
        this.itemDepth++;
        this.itemPrefix = `${'  '.repeat(Math.max(0, this.listDepth - 1))}- `;
        this.walk(child, nested);
        this.flush();
        this.itemPrefix = null;
        this.itemDepth--;
      } else if (name === 'table') {
        this.flush();
        this.table(child, nested);
      } else if (name === 'pre') {
        this.flush();
        this.push('pre', rawText(child).replace(/^\n+|\s+$/g, ''));
      } else if (BLOCKS.has(name) || name === 'tr' || name === 'td' || name === 'th') {
        this.flush();
        this.walk(child, nested);
        this.flush();
      } else {
        this.walk(child, nested);
      }
    }
  }

  finish(): string {
    this.flush();
    let out = '';
    let previous: Block | null = null;
    for (const block of this.blocks) {
      if (previous) {
        const sameList = block.kind === previous.kind && (block.kind === 'item' || block.kind === 'row');
        out += sameList ? '\n' : '\n\n';
      }
      out += block.text;
      previous = block;
    }
    return out;
  }
}

function imageText(image: Element): string {
  const alt = (attr(image, 'alt') ?? '').replace(/\s+/g, ' ').trim();
  return alt === '' ? '' : `[${alt}]`;
}

/** Text exactly as written, for <pre> blocks where spacing matters. */
function rawText(node: ParentNode): string {
  let out = '';
  for (const child of children(node)) {
    if (child.nodeName === '#text') out += (child as Tree.TextNode).value;
    else if (isElement(child)) out += child.tagName === 'br' ? '\n' : rawText(child);
  }
  return out;
}

/**
 * Where the content is: <main> (or role="main"), else the page's only article, else
 * the whole body with its menus, header and footer left out.
 */
function contentRoots(body: Element): Element[] {
  const main = findAll(body, (el) => el.tagName === 'main' || attr(el, 'role') === 'main')[0];
  const articles = findAll(
    body,
    (el) => el.tagName === 'article' && !hasAncestor(el, NOT_THE_ARTICLE),
  );
  const roots: Element[] = [];
  if (main) roots.push(main);
  if (articles.length === 1) roots.push(articles[0]);
  roots.push(body);
  return roots;
}

function textOf(root: Element, base: string): string {
  const writer = new PageWriter(base);
  writer.walk(root, SECTIONS.has(root.tagName));
  return writer.finish();
}

function baseUrl(document: Tree.Document, pageUrl: string): string {
  const href = findAll(document, (el) => el.tagName === 'base' && attr(el, 'href') !== null)[0];
  if (!href) return pageUrl;
  try {
    const url = new URL(attr(href, 'href') ?? '', pageUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : pageUrl;
  } catch {
    return pageUrl;
  }
}

function titleOf(document: Tree.Document, body: Element | undefined, base: string): string {
  const writer = new PageWriter(base);
  const title = findAll(document, (el) => el.tagName === 'title' && !hasAncestor(el, SVG))[0];
  if (title) {
    const text = rawText(title).replace(/\s+/g, ' ').trim();
    if (text) return text;
  }
  const og = findAll(document, (el) => el.tagName === 'meta' && attr(el, 'property') === 'og:title')[0];
  const ogText = og ? (attr(og, 'content') ?? '').replace(/\s+/g, ' ').trim() : '';
  if (ogText) return ogText;
  const h1 = body ? findAll(body, (el) => el.tagName === 'h1')[0] : undefined;
  return h1 ? writer.inlineText(h1, true) : '';
}

export function htmlToText(html: string, pageUrl: string): PageText {
  const document = parse(html);
  const body = findAll(document, (el) => el.tagName === 'body')[0];
  const base = baseUrl(document, pageUrl);
  const title = titleOf(document, body, base);
  if (!body) return { title, text: '' };
  for (const root of contentRoots(body)) {
    const text = textOf(root, base);
    if (text !== '') return { title, text };
  }
  return { title, text: '' };
}
