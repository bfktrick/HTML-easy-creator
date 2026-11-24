import { describe, expect, it } from 'vitest';
import { applyBlocks, applyEditReply, parseEditReply, parseSummary } from './apply-edits.ts';

const PAGE = `<!doctype html>
<html lang="es">
<head>
  <title>Taller de bicis</title>
  <style>
    h1 { font-size: 2rem; }
  </style>
</head>
<body>
  <h1>Taller de bicis</h1>
  <p>Abrimos los sábados.</p>
  <p>Trae tu bici.</p>
</body>
</html>`;

function block(search: string, replace: string): string {
  return `<<<<<<< SEARCH\n${search}\n=======\n${replace}\n>>>>>>> REPLACE`;
}

describe('parseSummary', () => {
  it('reads the summary on one line', () => {
    expect(parseSummary('<summary>\n  Título   más\ngrande.\n</summary>')).toBe('Título más grande.');
  });

  it('gives "" without a summary and shortens a very long one', () => {
    expect(parseSummary('no summary here')).toBe('');
    const long = parseSummary(`<summary>${'a'.repeat(500)}</summary>`);
    expect(long.length).toBe(200);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('parseEditReply', () => {
  it('reads the summary and the blocks in order', () => {
    const raw = `<summary>Cambia el título.</summary>\n${block('<h1>Taller de bicis</h1>', '<h1>Taller</h1>')}\n${block('a', '')}`;
    expect(parseEditReply(raw)).toEqual({
      kind: 'blocks',
      summary: 'Cambia el título.',
      blocks: [
        { search: '<h1>Taller de bicis</h1>', replace: '<h1>Taller</h1>' },
        { search: 'a', replace: '' },
      ],
      incomplete: null,
    });
  });

  it('keeps multi-line blocks and tolerates miscounted markers and CRLF', () => {
    const raw = '<<<<<<<< SEARCH\r\nline 1\r\nline 2\r\n======\r\nnew\r\n>>>>>>>REPLACE\r\n';
    const reply = parseEditReply(raw);
    expect(reply.kind === 'blocks' && reply.blocks).toEqual([{ search: 'line 1\nline 2', replace: 'new' }]);
  });

  it('does not take a <summary> element inside a block for the summary', () => {
    const raw = block('<details><summary>Horario</summary>', '<details open><summary>Horario</summary>');
    const reply = parseEditReply(raw);
    expect(reply.summary).toBe('');
    expect(reply.kind === 'blocks' && reply.blocks[0].search).toContain('<summary>Horario</summary>');
  });

  it('reads a summary written after the blocks', () => {
    expect(parseEditReply(`${block('a', 'b')}\n<summary>Hecho.</summary>`).summary).toBe('Hecho.');
  });

  it('flags a block that was cut off', () => {
    const reply = parseEditReply(`${block('a', 'b')}\n<<<<<<< SEARCH\n<p>Trae`);
    expect(reply.kind === 'blocks' && reply.incomplete).toEqual({ search: '<p>Trae', replace: '' });
  });

  it('accepts a complete document instead of blocks', () => {
    const doc = '<!doctype html><html><body><details><summary>Q</summary></details></body></html>';
    expect(parseEditReply(`<summary>Página rehecha.</summary>\n\`\`\`html\n${doc}\n\`\`\``)).toEqual({
      kind: 'document',
      summary: 'Página rehecha.',
      html: doc,
    });
  });

  it('does not take a document that never ends for a full page', () => {
    expect(parseEditReply('<summary>x</summary><!doctype html><html><body>').kind).toBe('none');
    expect(parseEditReply('Lo siento, no sé qué cambiar.').kind).toBe('none');
  });
});

describe('applyBlocks', () => {
  it('replaces an exact match and leaves the rest byte-identical', () => {
    const { html, failures } = applyBlocks(PAGE, [{ search: '<p>Abrimos los sábados.</p>', replace: '<p>Abrimos los domingos.</p>' }]);
    expect(failures).toEqual([]);
    expect(html).toBe(PAGE.replace('sábados', 'domingos'));
  });

  it('applies several blocks in sequence, each on the result of the last', () => {
    const { html, failures } = applyBlocks(PAGE, [
      { search: 'font-size: 2rem;', replace: 'font-size: 3rem;' },
      { search: '<p>Trae tu bici.</p>', replace: '<p>Trae tu bici.</p>\n  <p>Gratis.</p>' },
      { search: '<p>Gratis.</p>', replace: '<p>Gratis para socios.</p>' },
    ]);
    expect(failures).toEqual([]);
    expect(html).toContain('font-size: 3rem;');
    expect(html).toContain('<p>Trae tu bici.</p>\n  <p>Gratis para socios.</p>\n</body>');
  });

  it('deletes with an empty replacement', () => {
    expect(applyBlocks(PAGE, [{ search: '\n  <p>Trae tu bici.</p>', replace: '' }]).html).not.toContain('Trae');
  });

  it('matches despite different indentation and keeps the surrounding text', () => {
    const search = '    <p>Abrimos los sábados.</p>\n        <p>Trae tu bici.</p>';
    const replace = '    <p>Abrimos los sábados y domingos.</p>\n        <p>Trae tu bici.</p>';
    const { html, failures } = applyBlocks(PAGE, [{ search, replace }]);
    expect(failures).toEqual([]);
    expect(html).toBe(
      PAGE.replace(
        '<p>Abrimos los sábados.</p>\n  <p>Trae tu bici.</p>',
        '<p>Abrimos los sábados y domingos.</p>\n        <p>Trae tu bici.</p>',
      ),
    );
  });

  it('matches a CRLF page with LF blocks and keeps the page CRLF', () => {
    const crlf = PAGE.replace(/\n/g, '\r\n');
    const { html, failures } = applyBlocks(crlf, [
      { search: '<p>Abrimos los sábados.</p>\n  <p>Trae tu bici.</p>', replace: '<p>Abrimos.</p>\n  <p>Ven.</p>' },
    ]);
    expect(failures).toEqual([]);
    expect(html).toBe(crlf.replace('<p>Abrimos los sábados.</p>\r\n  <p>Trae tu bici.</p>', '<p>Abrimos.</p>\r\n  <p>Ven.</p>'));
    expect(html.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('does not treat missing whitespace as a match', () => {
    const { failures } = applyBlocks(PAGE, [{ search: '<p>Abrimoslos sábados.</p>', replace: 'x' }]);
    expect(failures).toEqual([{ reason: 'not_found', search: '<p>Abrimoslos sábados.</p>' }]);
  });

  it('fails a block whose text is in more than one place', () => {
    const { html, failures } = applyBlocks(PAGE, [{ search: 'Taller de bicis', replace: 'Taller' }]);
    expect(failures).toEqual([{ reason: 'ambiguous', search: 'Taller de bicis' }]);
    expect(html).toBe(PAGE);
  });

  it('counts overlapping and whitespace-only differences as ambiguous', () => {
    expect(applyBlocks('aaa', [{ search: 'aa', replace: 'b' }]).failures[0].reason).toBe('ambiguous');
    expect(applyBlocks('<b> x</b>\n<b>  x</b>', [{ search: '<b>   x</b>', replace: 'y' }]).failures[0].reason).toBe(
      'ambiguous',
    );
  });

  it('fails an empty SEARCH', () => {
    expect(applyBlocks(PAGE, [{ search: '  ', replace: 'x' }]).failures).toEqual([{ reason: 'empty_search', search: '  ' }]);
  });

  it('is all or nothing and reports every failing block', () => {
    const { html, failures } = applyBlocks(PAGE, [
      { search: '<p>Trae tu bici.</p>', replace: '<p>Trae la bici.</p>' },
      { search: '<p>No existe</p>', replace: '' },
      { search: 'Taller de bicis', replace: 'x' },
    ]);
    expect(html).toBe(PAGE);
    expect(failures.map((f) => f.reason)).toEqual(['not_found', 'ambiguous']);
  });
});

describe('applyEditReply', () => {
  it('applies the blocks and returns the summary', () => {
    const raw = `<summary>Título más grande.</summary>\n${block('h1 { font-size: 2rem; }', 'h1 { font-size: 3rem; }')}`;
    expect(applyEditReply(PAGE, raw)).toEqual({
      ok: true,
      html: PAGE.replace('2rem', '3rem'),
      summary: 'Título más grande.',
    });
  });

  it('returns the failures and no page when a block does not match', () => {
    const raw = `${block('<h1>Taller de bicis</h1>', '<h1>Taller</h1>')}\n${block('<h2>Nada</h2>', '')}`;
    expect(applyEditReply(PAGE, raw)).toEqual({ ok: false, failures: [{ reason: 'not_found', search: '<h2>Nada</h2>' }] });
  });

  it('refuses a reply that was cut off inside a block, even if the earlier blocks apply', () => {
    const raw = `${block('<h1>Taller de bicis</h1>', '<h1>Taller</h1>')}\n<<<<<<< SEARCH\n<p>Trae tu bici.</p>\n=======\n<p>Tr`;
    expect(applyEditReply(PAGE, raw)).toEqual({
      ok: false,
      failures: [{ reason: 'incomplete', search: '<p>Trae tu bici.</p>' }],
    });
  });

  it('takes a complete new document when the whole page is redone', () => {
    const doc = '<!doctype html>\n<html><body><h1>Nueva</h1></body></html>';
    expect(applyEditReply(PAGE, `<summary>Rehecha.</summary>\n${doc}`)).toEqual({ ok: true, html: doc, summary: 'Rehecha.' });
  });

  it('fails a reply with neither blocks nor a document', () => {
    expect(applyEditReply(PAGE, '<summary>Hecho.</summary>')).toEqual({
      ok: false,
      failures: [{ reason: 'no_edits', search: '' }],
    });
  });
});
