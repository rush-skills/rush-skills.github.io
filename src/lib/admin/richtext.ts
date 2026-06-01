// Minimal, constrained rich-text editor for the admin.
//
// Some site fields (about paragraphs, footer copyright) render as HTML so the
// author can bold a word or add a link. Editing raw HTML in a textarea is
// error-prone and inaccessible, so this gives a small WYSIWYG that allows ONLY
// what those fields should contain — **bold**, *italic*, and links — and nothing
// else (no font sizes, colors, headings, block elements). Whatever the browser
// produces is run through a strict serializer so the stored value is always clean
// HTML limited to <strong>, <em>, and <a href> (external links get target/rel).

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string) => escHtml(s).replace(/"/g, '&quot;');

// Allow only safe link targets; reject javascript:/data: etc.
function safeHref(href: string): string {
  const h = (href || '').trim();
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(h)) return h;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(h)) return 'mailto:' + h; // bare email
  return '';
}

// Tag remap: <b>→strong, <i>→em; <a> kept (sanitized); everything else unwrapped.
const INLINE: Record<string, string> = { strong: 'strong', b: 'strong', em: 'em', i: 'em' };

function serialize(root: HTMLElement): string {
  const walk = (node: Node): string => {
    let s = '';
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        s += escHtml((child.nodeValue || '').replace(/\s+/g, ' '));
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const el = child as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const inner = walk(el);
      if (tag === 'a') {
        const href = safeHref(el.getAttribute('href') || '');
        if (href && inner) {
          const ext = /^https?:/i.test(href);
          s += `<a href="${escAttr(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${inner}</a>`;
        } else {
          s += inner;
        }
      } else if (INLINE[tag]) {
        s += inner ? `<${INLINE[tag]}>${inner}</${INLINE[tag]}>` : '';
      } else if (tag === 'br' || tag === 'div' || tag === 'p') {
        // No block structure in these fields: separate with a space.
        s += (s && !s.endsWith(' ') ? ' ' : '') + inner;
      } else {
        s += inner; // unwrap spans, fonts, styled nodes — keep their text only
      }
    });
    return s;
  };
  return walk(root).replace(/\s+/g, ' ').trim();
}

export interface RichTextOpts {
  value?: string;
  placeholder?: string;
  onChange: (html: string) => void;
}

export class RichTextEditor {
  el: HTMLElement;

  constructor(host: HTMLElement, private opts: RichTextOpts) {
    host.classList.add('rt-editor');
    host.innerHTML = '';

    const bar = document.createElement('div');
    bar.className = 'rt-toolbar';
    const mkBtn = (label: string, title: string, fn: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'rt-btn';
      b.title = title;
      b.innerHTML = label;
      // mousedown (not click) so the editor keeps its selection.
      b.addEventListener('mousedown', (e) => { e.preventDefault(); fn(); });
      return b;
    };

    const area = document.createElement('div');
    area.className = 'rt-area';
    area.contentEditable = 'true';
    area.spellcheck = true;
    if (opts.placeholder) area.dataset.placeholder = opts.placeholder;
    area.innerHTML = opts.value || '';
    this.el = area;

    const exec = (cmd: string, val?: string) => {
      area.focus();
      try { document.execCommand('styleWithCSS', false, 'false'); } catch { /* not all browsers */ }
      document.execCommand(cmd, false, val);
      this.emit();
    };

    bar.append(
      mkBtn('<strong>B</strong>', 'Bold (Ctrl/Cmd+B)', () => exec('bold')),
      mkBtn('<em>I</em>', 'Italic (Ctrl/Cmd+I)', () => exec('italic')),
      mkBtn('🔗', 'Add link (Ctrl/Cmd+K)', () => this.linkPrompt()),
      mkBtn('⛓️‍💥', 'Remove link', () => exec('unlink')),
    );

    // Paste as plain text — never let formatted HTML in.
    area.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || (window as any).clipboardData)?.getData('text/plain') || '';
      document.execCommand('insertText', false, text);
    });
    area.addEventListener('input', () => this.emit());
    area.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey) {
        const k = e.key.toLowerCase();
        if (k === 'b') { e.preventDefault(); exec('bold'); }
        else if (k === 'i') { e.preventDefault(); exec('italic'); }
        else if (k === 'k') { e.preventDefault(); this.linkPrompt(); }
      }
    });

    host.append(bar, area);
  }

  private linkPrompt() {
    this.el.focus();
    const sel = window.getSelection();
    const hasSelection = sel && sel.toString().trim().length > 0;
    const url = window.prompt('Link URL (https://…, mailto:…, /path, or #anchor):', 'https://');
    if (!url) return;
    const href = safeHref(url);
    if (!href) { window.alert('That link type isn’t allowed.'); return; }
    if (hasSelection) {
      document.execCommand('createLink', false, href);
    } else {
      // No selection: insert the URL as its own linked text.
      document.execCommand('insertHTML', false, `<a href="${escAttr(href)}">${escHtml(url)}</a>`);
    }
    this.emit();
  }

  private emit() {
    this.opts.onChange(serialize(this.el));
  }

  /** Current sanitized HTML. */
  get value(): string {
    return serialize(this.el);
  }
}
