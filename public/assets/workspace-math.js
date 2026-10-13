(() => {
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const pattern = /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\\)\$(?!\s)(?:\\.|[^$\\])+(?<!\s)\$/g;
  window.renderAssistantMath = value => {
    const input = String(value || '');
    if (!window.katex) return escape(input);
    let cursor = 0, html = '';
    for (const match of input.matchAll(pattern)) {
      const raw = match[0], start = match.index;
      html += escape(input.slice(cursor, start));
      const displayMode = raw.startsWith('$$') || raw.startsWith('\\[');
      const formula = raw.slice(raw.startsWith('$$') ? 2 : raw.startsWith('$') ? 1 : 2, raw.endsWith('$$') ? -2 : raw.endsWith('$') ? -1 : -2);
      try { html += window.katex.renderToString(formula, { displayMode, throwOnError: true, trust: false, strict: 'ignore', output: 'html' }); }
      catch { html += escape(raw); }
      cursor = start + raw.length;
    }
    return html + escape(input.slice(cursor));
  };
})();
