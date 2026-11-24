const MAX_SLUG = 60;
// Titles often read "Page · Site" or "Page | Section"; the file is named after the first part.
const TITLE_SEPARATOR = /\s+[·|–—-]\s+/;

/** "Guía de Montaje · Tienda" in <title> becomes "guia-de-montaje.html". */
export function fileNameFor(html: string): string {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '';
  const slug = title
    .split(TITLE_SEPARATOR)[0]
    .replace(/&[#a-z0-9]+;/gi, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, MAX_SLUG)
    .replace(/^-+|-+$/g, '');
  return `${slug || 'page'}.html`;
}

export function downloadHtml(html: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileNameFor(html);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
