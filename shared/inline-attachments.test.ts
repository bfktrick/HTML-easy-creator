import { describe, expect, it } from 'vitest';
import { inlineAttachments, tokenizeAttachments } from './inline-attachments.ts';

const LOGO = { mediaType: 'image/png', data: 'iVBORw0KGgo=' };
const PHOTO = { mediaType: 'image/jpeg', data: '/9j/4AAQSkZJRg==' };
const IMAGES = [LOGO, PHOTO];

const PAGE = `<!doctype html><html><body>
<img src="attachment:1" alt="Logo">
<img src='attachment:2' alt="Taller">
<div style="background-image: url(attachment:2)"></div>
<p>Write attachment:1 in the src to show the logo.</p>
<img src="attachment:7" alt="?">
</body></html>`;

describe('inlineAttachments', () => {
  it('puts each image in place of attachment:N', () => {
    const html = inlineAttachments(PAGE, IMAGES);
    expect(html).toContain('<img src="data:image/png;base64,iVBORw0KGgo=" alt="Logo">');
    expect(html).toContain("<img src='data:image/jpeg;base64,/9j/4AAQSkZJRg==' alt=\"Taller\">");
    expect(html).toContain('url(data:image/jpeg;base64,/9j/4AAQSkZJRg==)');
  });

  it('leaves unknown numbers and plain text alone', () => {
    const html = inlineAttachments(PAGE, IMAGES);
    expect(html).toContain('<img src="attachment:7" alt="?">');
    expect(html).toContain('<p>Write attachment:1 in the src to show the logo.</p>');
    expect(inlineAttachments('<img src="attachment:0">', IMAGES)).toBe('<img src="attachment:0">');
  });

  it('changes nothing without images', () => {
    expect(inlineAttachments(PAGE, [])).toBe(PAGE);
  });
});

describe('tokenizeAttachments', () => {
  it('turns the images back into attachment:N', () => {
    expect(tokenizeAttachments(inlineAttachments(PAGE, IMAGES), IMAGES)).toBe(PAGE);
  });

  it('leaves other data URLs alone', () => {
    const html = '<img src="data:image/png;base64,AAAA">';
    expect(tokenizeAttachments(html, IMAGES)).toBe(html);
  });
});
