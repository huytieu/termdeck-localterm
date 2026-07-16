// The artifact element-picker: a self-contained script injected into any HTML
// rendered in the artifact drawer (a vault .html file as srcDoc, or a remote
// deploy URL proxied through /api/artifact/proxy). It turns the framed page
// into a Claude-design-style select surface — hover highlights the element
// under the cursor, a click marks it and posts its selector + snippet up to the
// parent shell, which anchors a "what should change?" note popover next to it.
//
// It talks to the parent ONLY via window.postMessage, so it works even from a
// sandboxed null-origin iframe (no allow-same-origin). Protocol:
//   parent -> iframe : {source:'termdeck-picker', cmd:'enable'|'disable'|'remove'|'clear', id?}
//   iframe -> parent : {source:'termdeck-picker', event:'ready'|'selected', ...}
export const ARTIFACT_PICKER_JS = String.raw`(function () {
  if (window.__termdeckPicker) return;
  var enabled = false;
  var picks = []; // {id, el, mark, badge}
  var seq = 0;
  var hover = null;
  var style = null;

  function post(msg) {
    msg.source = 'termdeck-picker';
    try { parent.postMessage(msg, '*'); } catch (e) {}
  }

  function ensureChrome() {
    if (style) return;
    style = document.createElement('style');
    style.textContent =
      '.__td-hl{position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #ff6b5c;' +
      'background:rgba(255,107,92,0.12);border-radius:3px;box-sizing:border-box;}' +
      '.__td-mark{position:fixed;pointer-events:none;z-index:2147483645;border:2px dashed #ff6b5c;' +
      'border-radius:3px;box-sizing:border-box;}' +
      '.__td-badge{position:fixed;pointer-events:none;z-index:2147483647;background:#ff6b5c;color:#fff;' +
      "font:600 11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;min-width:16px;text-align:center;" +
      'padding:0 5px;border-radius:9px;box-shadow:0 1px 4px rgba(0,0,0,.35);}' +
      'html.__td-active,html.__td-active *{cursor:crosshair !important;}';
    document.documentElement.appendChild(style);
    hover = document.createElement('div');
    hover.className = '__td-hl';
    hover.style.display = 'none';
    document.documentElement.appendChild(hover);
  }

  function isOwn(el) {
    return el && el.classList && (el.classList.contains('__td-hl') ||
      el.classList.contains('__td-mark') || el.classList.contains('__td-badge'));
  }

  function rectOf(el) {
    var r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right };
  }

  function place(node, r) {
    node.style.top = r.top + 'px';
    node.style.left = r.left + 'px';
    node.style.width = r.width + 'px';
    node.style.height = r.height + 'px';
  }

  function cssPath(el) {
    if (!(el instanceof Element)) return '';
    if (el.id) return '#' + CSS.escape(el.id);
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement && parts.length < 6) {
      var sel = node.nodeName.toLowerCase();
      if (node.id) { parts.unshift('#' + CSS.escape(node.id)); break; }
      var cls = (node.getAttribute('class') || '').trim().split(/\s+/)
        .filter(function (c) { return c && !/^__td-/.test(c); });
      if (cls.length) sel += '.' + cls.slice(0, 2).map(function (c) { return CSS.escape(c); }).join('.');
      var parent = node.parentNode;
      if (parent && parent.children) {
        var same = Array.prototype.filter.call(parent.children, function (c) { return c.nodeName === node.nodeName; });
        if (same.length > 1) sel += ':nth-of-type(' + (Array.prototype.indexOf.call(parent.children, node) + 1) + ')';
      }
      parts.unshift(sel);
      node = node.parentNode;
    }
    return parts.join(' > ');
  }

  function snippetOf(el) {
    var h = el.outerHTML || '';
    if (h.length > 400) {
      var openEnd = h.indexOf('>');
      var open = openEnd >= 0 ? h.slice(0, openEnd + 1) : h.slice(0, 120);
      h = open + ' … ' + (el.textContent || '').trim().slice(0, 140);
    }
    return h;
  }

  function badgePlace(p, i) {
    var r = rectOf(p.el);
    place(p.mark, r);
    p.badge.style.top = Math.max(r.top, 0) + 2 + 'px';
    p.badge.style.left = Math.max(r.left, 0) + 2 + 'px';
    p.badge.textContent = String(i + 1);
  }

  function onMove(e) {
    if (!enabled) return;
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === hover || isOwn(el)) return;
    hover.__el = el;
    hover.style.display = 'block';
    place(hover, rectOf(el));
  }

  function onClick(e) {
    if (!enabled) return;
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || isOwn(el)) return;
    e.preventDefault();
    e.stopPropagation();
    var id = 'p' + ++seq;
    var mark = document.createElement('div');
    mark.className = '__td-mark';
    var badge = document.createElement('div');
    badge.className = '__td-badge';
    document.documentElement.appendChild(mark);
    document.documentElement.appendChild(badge);
    var p = { id: id, el: el, mark: mark, badge: badge };
    picks.push(p);
    badgePlace(p, picks.length - 1);
    post({
      event: 'selected', id: id, selector: cssPath(el), tag: el.nodeName.toLowerCase(),
      snippet: snippetOf(el), text: (el.textContent || '').trim().slice(0, 200), rect: rectOf(el),
    });
  }

  function reflow() {
    if (hover && hover.__el && hover.style.display !== 'none') place(hover, rectOf(hover.__el));
    picks.forEach(badgePlace);
  }

  function removePick(id) {
    for (var i = 0; i < picks.length; i++) {
      if (picks[i].id === id) { picks[i].mark.remove(); picks[i].badge.remove(); picks.splice(i, 1); break; }
    }
    picks.forEach(badgePlace);
  }

  function clearPicks() {
    picks.forEach(function (p) { p.mark.remove(); p.badge.remove(); });
    picks = [];
  }

  function setEnabled(v) {
    enabled = v;
    ensureChrome();
    document.documentElement.classList.toggle('__td-active', v);
    // Only listen for mousemove (the high-frequency event) while picking; when
    // off, the picker is dormant and costs nothing per pointer move.
    if (v) {
      document.addEventListener('mousemove', onMove, true);
    } else {
      document.removeEventListener('mousemove', onMove, true);
      if (hover) hover.style.display = 'none';
    }
  }

  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.source !== 'termdeck-picker' || !d.cmd) return;
    if (d.cmd === 'enable') setEnabled(true);
    else if (d.cmd === 'disable') setEnabled(false);
    else if (d.cmd === 'remove') removePick(d.id);
    else if (d.cmd === 'clear') clearPicks();
  });
  // click stays capture-bound (it early-returns when disabled and fires rarely);
  // mousemove is attached on-demand in setEnabled. scroll/resize only reposition
  // existing marks, which is a no-op while nothing is selected.
  document.addEventListener('click', onClick, true);
  window.addEventListener('scroll', reflow, true);
  window.addEventListener('resize', reflow, true);
  window.__termdeckPicker = true;
  post({ event: 'ready' });
})();`;

// A small self-contained page shown IN the artifact iframe when a remote link
// can't be previewed (auth-gated, timed out, unreachable). Rendering readable
// HTML — rather than a JSON error the browser shows in its raw "Pretty-print"
// viewer — keeps the drawer legible and points at the header's open-in-browser
// button. Links can't navigate out of the sandboxed frame, so the URL is text.
export const artifactNoticeHtml = (heading: string, detail: string, url?: string): string => {
  const esc = (s: string): string =>
    s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><style>
html,body{height:100%;margin:0}
body{display:flex;align-items:center;justify-content:center;background:#0d1117;color:#e6edf3;
font:14px/1.6 ui-sans-serif,-apple-system,system-ui,sans-serif;padding:24px}
.card{max-width:460px;text-align:center}
h1{font-size:17px;margin:0 0 8px}
p{margin:0 0 12px;color:#9aa4b2}
code{display:block;word-break:break-all;background:#161b22;border:1px solid #30363d;border-radius:8px;
padding:10px 12px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#c9d1d9}
.hint{font-size:12px;color:#6b7280;margin-top:14px}
</style></head><body><div class="card"><h1>${esc(heading)}</h1><p>${esc(detail)}</p>${
    url ? `<code>${esc(url)}</code>` : ""
  }<p class="hint">Use the ↗ button in the header to open it in a browser tab.</p></div></body></html>`;
};

// Prepare fetched remote HTML for framing: drop any Content-Security-Policy
// <meta> (it would block our injected inline picker + relaxed asset loading),
// inject a <base> so the page's relative asset URLs still resolve against its
// real origin, and append the picker script. Only the top document is proxied;
// sub-resources load direct from the origin via <base>.
export const injectArtifactChrome = (html: string, opts: { baseHref?: string } = {}): string => {
  let out = html.replace(
    /<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi,
    "",
  );
  if (opts.baseHref) {
    const baseTag = `<base href="${opts.baseHref.replace(/"/g, "&quot;")}">`;
    if (/<head[^>]*>/i.test(out)) out = out.replace(/<head[^>]*>/i, (m) => m + baseTag);
    else if (/<html[^>]*>/i.test(out)) out = out.replace(/<html[^>]*>/i, (m) => `${m}<head>${baseTag}</head>`);
    else out = baseTag + out;
  }
  // Inline the picker (not a <script src>) so the injected <base href> can't
  // rewrite its URL to the remote origin and 404 it. `</script>` is escaped
  // defensively though the picker source contains none.
  const inlineTag = `<script data-termdeck-picker>${ARTIFACT_PICKER_JS.replace(/<\/script>/gi, "<\\/script>")}</script>`;
  if (/<\/body>/i.test(out)) out = out.replace(/<\/body>/i, `${inlineTag}</body>`);
  else out += inlineTag;
  return out;
};
