/** Yields one parsed JSON value per line of a streamed response body. */
export async function* readNdjson(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  // stream: true keeps a character whose bytes are split between chunks intact.
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) yield JSON.parse(line);
        newline = buffer.indexOf('\n');
      }
    }
    const rest = (buffer + decoder.decode()).trim();
    if (rest) yield JSON.parse(rest);
  } finally {
    reader.releaseLock();
  }
}
