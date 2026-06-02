// Recursive form renderer for a CMS section (see sections.ts). It edits a live
// clone of the section's JSON: every control mutates the data object in place, so
// arbitrarily nested groups/lists (projects → items → links) just work and
// `value()` is the edited document. No DOM scraping.
import type { SecField, SectionDef } from './sections';
import { uploadFile } from './client';
import { RichTextEditor } from './richtext';
import { ICON_CATALOG } from './icon-catalog';

function h(tag: string, attrs: Record<string, any> = {}, ...children: (Node | string)[]): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') node.className = v;
    else node.setAttribute(k, String(v));
  }
  for (const c of children) node.append(c);
  return node;
}

const labelize = (s: string) =>
  (s ?? '').replace(/[-_]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (c) => c.toUpperCase());

const isHex = (s: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s);

const clone = (v: any) => {
  try { return typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)); }
  catch { return JSON.parse(JSON.stringify(v ?? {})); }
};

// Resolves once the Lordicon player has registered <lord-icon> (the admin SPA
// injects the script — see ensureLordicon in app.ts). The player only paints
// elements created AFTER it loads, so we create each icon lazily off this promise
// and rebuild on edit, rather than mutating an existing element's src.
const lordiconReady: Promise<unknown> =
  typeof customElements !== 'undefined'
    ? customElements.whenDefined('lord-icon').catch(() => {})
    : Promise.resolve();

export class SectionForm {
  data: any;

  constructor(private container: HTMLElement, private def: SectionDef, data: any) {
    this.data = data && typeof data === 'object' ? clone(data) : {};
    this.render();
  }

  /** The edited section document, ready to JSON.stringify. */
  value(): any { return this.data; }

  private render() {
    this.container.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const f of this.def.fields) frag.append(this.field(f, this.data));
    this.container.append(frag);
  }

  private field(f: SecField, parent: any): HTMLElement {
    try {
      return this.fieldSafe(f, parent);
    } catch (e) {
      const box = document.createElement('div');
      box.className = 'adm-field';
      box.textContent = `(${(f && f.label) || (f && f.name) || 'field'}: couldn't render — ${(e as Error).message})`;
      return box;
    }
  }

  private fieldSafe(f: SecField, parent: any): HTMLElement {
    switch (f.type) {
      case 'group': return this.groupField(f, parent);
      case 'list': return this.listField(f, parent);
      case 'textlist': return this.textlistField(f, parent);
      case 'richtext': return this.richtextField(f, parent);
      case 'richtextlist': return this.richtextlistField(f, parent);
      case 'tags': return this.tagsField(f, parent);
      case 'boolean': return this.boolField(f, parent);
      default: return this.scalarField(f, parent);
    }
  }

  private labelEl(f: SecField) {
    return h('label', { class: 'adm-label' }, f.label || labelize(f.name));
  }

  // --- Scalars (text / textarea / color / icon / select / number / image) ---
  private scalarField(f: SecField, parent: any): HTMLElement {
    const wrap = h('div', { class: 'adm-field' }, this.labelEl(f));
    const val = parent[f.name] ?? '';
    let control: HTMLElement;

    if (f.type === 'textarea') {
      const ta = h('textarea', { class: 'adm-input adm-textarea', placeholder: f.placeholder || '' }) as HTMLTextAreaElement;
      ta.value = String(val);
      ta.addEventListener('input', () => { parent[f.name] = ta.value; });
      control = ta;
    } else if (f.type === 'select') {
      const opts = f.options || [];
      // Default an unset select to its first option so showIf logic + saved value
      // match what the user sees.
      if ((val === '' || val == null) && opts.length) parent[f.name] = opts[0];
      const current = parent[f.name];
      const sel = h('select', { class: 'adm-input' }) as HTMLSelectElement;
      for (const o of opts) {
        const opt = h('option', {}, o) as HTMLOptionElement;
        if (o === current) opt.selected = true;
        sel.append(opt);
      }
      sel.addEventListener('change', () => { parent[f.name] = sel.value; });
      control = sel;
    } else if (f.type === 'number') {
      const inp = h('input', { type: 'number', class: 'adm-input' }) as HTMLInputElement;
      inp.value = val === '' ? '' : String(val);
      inp.addEventListener('input', () => { parent[f.name] = inp.value === '' ? null : Number(inp.value); });
      control = inp;
    } else if (f.type === 'color') {
      control = this.colorControl(f, parent);
    } else if (f.type === 'icon') {
      control = this.iconControl(f, parent);
    } else if (f.type === 'image') {
      control = this.imageControl(f, parent);
    } else {
      const inp = h('input', { type: 'text', class: 'adm-input', placeholder: f.placeholder || '' }) as HTMLInputElement;
      inp.value = String(val);
      inp.addEventListener('input', () => { parent[f.name] = inp.value; });
      control = inp;
    }

    wrap.append(control);
    if (f.help) wrap.append(h('p', { class: 'adm-help' }, f.help));
    return wrap;
  }

  private colorControl(f: SecField, parent: any): HTMLElement {
    const val = String(parent[f.name] ?? '');
    const row = h('div', { class: 'adm-color' });
    const swatch = h('input', { type: 'color', class: 'adm-color-swatch', value: isHex(val) ? val : '#888888' }) as HTMLInputElement;
    const text = h('input', { type: 'text', class: 'adm-input adm-color-text', placeholder: '#2E5090 or rgba(…)' }) as HTMLInputElement;
    text.value = val;
    swatch.addEventListener('input', () => { text.value = swatch.value; parent[f.name] = swatch.value; });
    text.addEventListener('input', () => { parent[f.name] = text.value; if (isHex(text.value)) swatch.value = text.value; });
    row.append(swatch, text);
    return row;
  }

  private iconControl(f: SecField, parent: any): HTMLElement {
    const wrap = h('div', { class: 'adm-icon-control' });
    const row = h('div', { class: 'adm-icon-field' });
    const box = h('span', { class: 'adm-icon-preview' });
    const inp = h('input', { type: 'text', class: 'adm-input', placeholder: 'lordicon hash' }) as HTMLInputElement;
    inp.value = String(parent[f.name] ?? '');
    const browse = h('button', { type: 'button', class: 'adm-btn adm-icon-browse' }, 'Browse') as HTMLButtonElement;

    // (Re)create the <lord-icon> fresh off `lordiconReady` — the player only paints
    // elements created AFTER it loads, so mutating an existing element's src leaves
    // it blank.
    const paint = () => {
      const v = String(parent[f.name] ?? '').trim();
      box.innerHTML = '';
      if (!v) return;
      const ic = document.createElement('lord-icon');
      ic.setAttribute('src', `https://cdn.lordicon.com/${v}.json`);
      ic.setAttribute('trigger', 'loop');
      ic.setAttribute('colors', 'primary:#2E5090,secondary:#2E5090');
      ic.style.width = '30px';
      ic.style.height = '30px';
      box.appendChild(ic);
    };
    const setValue = (v: string) => {
      parent[f.name] = v;
      inp.value = v;
      lordiconReady.then(paint);
      grid.querySelectorAll('.adm-icon-cell').forEach((c) =>
        c.classList.toggle('adm-icon-cell-active', (c as HTMLElement).dataset.hash === v));
    };
    let timer: any;
    inp.addEventListener('input', () => {
      parent[f.name] = inp.value.trim();
      clearTimeout(timer);
      timer = setTimeout(() => lordiconReady.then(paint), 300);
    });

    // Curated gallery (built lazily on first open). Lets editors click an icon
    // instead of pasting a hash. See src/lib/admin/icon-catalog.ts.
    const gallery = h('div', { class: 'adm-icon-gallery', hidden: 'hidden' });
    const search = h('input', { type: 'text', class: 'adm-input adm-icon-search', placeholder: 'Filter icons…' }) as HTMLInputElement;
    const grid = h('div', { class: 'adm-icon-grid' });
    let built = false;
    const build = (q = '') => {
      grid.innerHTML = '';
      const needle = q.trim().toLowerCase();
      for (const group of ICON_CATALOG) {
        const matches = group.icons.filter((ic) => !needle || ic.label.toLowerCase().includes(needle) || ic.hash.includes(needle));
        if (!matches.length) continue;
        grid.append(h('div', { class: 'adm-icon-grid-group' }, group.group));
        const items = h('div', { class: 'adm-icon-grid-items' });
        for (const ic of matches) {
          const cell = h('button', { type: 'button', class: 'adm-icon-cell', title: `${ic.label} · ${ic.hash}`, 'data-hash': ic.hash });
          if (ic.hash === String(parent[f.name] ?? '')) cell.classList.add('adm-icon-cell-active');
          const prev = h('span', { class: 'adm-icon-cell-preview' });
          lordiconReady.then(() => {
            const el = document.createElement('lord-icon');
            el.setAttribute('src', `https://cdn.lordicon.com/${ic.hash}.json`);
            el.setAttribute('trigger', 'hover');
            el.setAttribute('colors', 'primary:#2E5090,secondary:#2E5090');
            el.style.width = '32px';
            el.style.height = '32px';
            prev.appendChild(el);
          });
          cell.append(prev, h('span', { class: 'adm-icon-cell-label' }, ic.label));
          cell.addEventListener('click', () => setValue(ic.hash));
          items.append(cell);
        }
        grid.append(items);
      }
      if (!grid.childElementCount) grid.append(h('p', { class: 'adm-help' }, 'No icons match.'));
    };
    search.addEventListener('input', () => build(search.value));
    browse.addEventListener('click', () => {
      if (gallery.hasAttribute('hidden')) {
        if (!built) { build(); built = true; }
        gallery.removeAttribute('hidden');
        browse.textContent = 'Close';
      } else {
        gallery.setAttribute('hidden', 'hidden');
        browse.textContent = 'Browse';
      }
    });
    gallery.append(search, grid);

    row.append(box, inp, browse);
    wrap.append(row, gallery);
    lordiconReady.then(paint);
    return wrap;
  }

  private imageControl(f: SecField, parent: any): HTMLElement {
    const wrap = h('div', { class: 'adm-image' });
    const inp = h('input', { type: 'text', class: 'adm-input adm-image-url', placeholder: 'Image URL or drop a file' }) as HTMLInputElement;
    inp.value = String(parent[f.name] ?? '');
    const drop = h('div', { class: 'adm-image-drop' }, 'Drop image to upload');
    const prev = h('div', { class: 'adm-image-preview' });
    const show = () => {
      const u = inp.value.trim();
      prev.innerHTML = '';
      if (u) prev.append(h('img', { src: u, alt: '' }));
    };
    inp.addEventListener('input', () => { parent[f.name] = inp.value.trim(); show(); });
    const upload = async (file: File) => {
      drop.textContent = `Uploading ${file.name}…`;
      try {
        // Reuse the posts table's file field to store into R2; the returned URL
        // works anywhere (content has no file field of its own).
        const url = await uploadFile('posts', 'cover_image', file);
        inp.value = url; parent[f.name] = url; show();
        drop.textContent = 'Drop image to upload';
      } catch (e) {
        drop.textContent = `Upload failed: ${(e as Error).message}`;
      }
    };
    ['dragover', 'dragenter'].forEach((ev) => wrap.addEventListener(ev, (e) => { e.preventDefault(); wrap.classList.add('adm-dragging'); }));
    ['dragleave', 'drop'].forEach((ev) => wrap.addEventListener(ev, (e) => { e.preventDefault(); wrap.classList.remove('adm-dragging'); }));
    wrap.addEventListener('drop', (e) => {
      const file = (e as DragEvent).dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) upload(file);
    });
    wrap.append(inp, drop, prev);
    show();
    return wrap;
  }

  private boolField(f: SecField, parent: any): HTMLElement {
    const wrap = h('div', { class: 'adm-field' });
    const lab = h('label', { class: 'adm-switch' });
    const cb = h('input', { type: 'checkbox' }) as HTMLInputElement;
    // Unset booleans fall back to `default` (so an untouched "enabled" reads as
    // on). We only write on change, so the default stays implicit until edited.
    cb.checked = parent[f.name] === undefined ? !!f.default : !!parent[f.name];
    cb.addEventListener('change', () => { parent[f.name] = cb.checked; });
    lab.append(cb, h('span', {}, f.label || labelize(f.name)));
    wrap.append(lab);
    if (f.help) wrap.append(h('p', { class: 'adm-help' }, f.help));
    return wrap;
  }

  // --- Tags (array of strings, pill UI) -------------------------------------
  private tagsField(f: SecField, parent: any): HTMLElement {
    if (!Array.isArray(parent[f.name])) parent[f.name] = [];
    const arr: string[] = parent[f.name];
    const wrap = h('div', { class: 'adm-field' }, this.labelEl(f));
    const box = h('div', { class: 'adm-tags' });
    const pills = h('div', { class: 'adm-tags-pills' });
    const input = h('input', { type: 'text', class: 'adm-tags-input', placeholder: 'Add and press Enter' }) as HTMLInputElement;
    const draw = () => {
      pills.innerHTML = '';
      arr.forEach((tg, i) => {
        const pill = h('span', { class: 'adm-pill' }, tg);
        const x = h('button', { type: 'button' }, '×');
        x.addEventListener('click', () => { arr.splice(i, 1); draw(); });
        pill.append(x); pills.append(pill);
      });
    };
    const add = (raw: string) => {
      raw.split(',').map((s) => s.trim()).filter(Boolean).forEach((tg) => { if (!arr.includes(tg)) arr.push(tg); });
      input.value = ''; draw();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input.value); }
      else if (e.key === 'Backspace' && !input.value && arr.length) { arr.pop(); draw(); }
    });
    input.addEventListener('blur', () => { if (input.value.trim()) add(input.value); });
    box.append(pills, input); wrap.append(box); draw();
    if (f.help) wrap.append(h('p', { class: 'adm-help' }, f.help));
    return wrap;
  }

  // --- Reorder / remove controls shared by lists ----------------------------
  private itemControls(arr: any[], i: number, redraw: () => void): HTMLElement {
    const box = h('div', { class: 'adm-item-ctrls' });
    const mk = (txt: string, title: string, fn: () => void, danger = false) => {
      const b = h('button', { type: 'button', class: `adm-icon-btn${danger ? ' adm-danger' : ''}`, title }, txt);
      b.addEventListener('click', fn);
      return b;
    };
    box.append(
      mk('↑', 'Move up', () => { if (i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; redraw(); } }),
      mk('↓', 'Move down', () => { if (i < arr.length - 1) { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; redraw(); } }),
      mk('🗑', 'Remove', () => { arr.splice(i, 1); redraw(); }, true),
    );
    return box;
  }

  // --- Repeatable list of objects -------------------------------------------
  private listField(f: SecField, parent: any): HTMLElement {
    if (!Array.isArray(parent[f.name])) parent[f.name] = [];
    const arr: any[] = parent[f.name];
    const wrap = h('div', { class: 'adm-field' }, this.labelEl(f));
    if (f.help) wrap.append(h('p', { class: 'adm-help' }, f.help));
    const list = h('div', { class: 'adm-list' });
    const draw = () => {
      list.innerHTML = '';
      arr.forEach((item, i) => {
        if (typeof item !== 'object' || item == null) arr[i] = {};
        const card = h('div', { class: 'adm-card' });
        const head = h('div', { class: 'adm-card-head' });
        const title = (f.itemTitleKey && arr[i][f.itemTitleKey]) || `${f.itemLabel || 'Item'} ${i + 1}`;
        head.append(h('span', { class: 'adm-card-title' }, String(title)), this.itemControls(arr, i, draw));
        const body = h('div', { class: 'adm-card-body' });
        // Render only fields whose showIf matches this item's values; a
        // rerenderOnChange select rebuilds the body so the visible set updates.
        const renderBody = () => {
          body.innerHTML = '';
          for (const sub of f.fields || []) {
            if (sub.showIf && !sub.showIf.in.includes(arr[i][sub.showIf.field])) continue;
            const el = this.field(sub, arr[i]);
            if (sub.rerenderOnChange) el.addEventListener('change', () => renderBody());
            body.append(el);
          }
        };
        renderBody();
        card.append(head, body);
        list.append(card);
      });
    };
    const add = h('button', { type: 'button', class: 'adm-btn adm-add' }, `+ Add ${f.itemLabel || 'item'}`);
    add.addEventListener('click', () => { arr.push({}); draw(); });
    wrap.append(list, add); draw();
    return wrap;
  }

  // --- Rich text (constrained WYSIWYG -> sanitized HTML) --------------------
  private richtextField(f: SecField, parent: any): HTMLElement {
    const wrap = h('div', { class: 'adm-field' }, this.labelEl(f));
    const host = h('div');
    new RichTextEditor(host, {
      value: String(parent[f.name] ?? ''),
      placeholder: f.placeholder || '',
      onChange: (html) => { parent[f.name] = html; },
    });
    wrap.append(host);
    if (f.help) wrap.append(h('p', { class: 'adm-help' }, f.help));
    return wrap;
  }

  // Repeatable list of rich-text values (e.g. About paragraphs).
  private richtextlistField(f: SecField, parent: any): HTMLElement {
    if (!Array.isArray(parent[f.name])) parent[f.name] = [];
    const arr: string[] = parent[f.name];
    const wrap = h('div', { class: 'adm-field' }, this.labelEl(f));
    if (f.help) wrap.append(h('p', { class: 'adm-help' }, f.help));
    const list = h('div', { class: 'adm-list' });
    const draw = () => {
      list.innerHTML = '';
      arr.forEach((s, i) => {
        const row = h('div', { class: 'adm-list-item' });
        const host = h('div', { class: 'adm-rt-host' });
        new RichTextEditor(host, { value: s ?? '', onChange: (html) => { arr[i] = html; } });
        row.append(host, this.itemControls(arr, i, draw));
        list.append(row);
      });
    };
    const add = h('button', { type: 'button', class: 'adm-btn adm-add' }, '+ Add');
    add.addEventListener('click', () => { arr.push(''); draw(); });
    wrap.append(list, add); draw();
    return wrap;
  }

  // --- Repeatable list of strings -------------------------------------------
  private textlistField(f: SecField, parent: any): HTMLElement {
    if (!Array.isArray(parent[f.name])) parent[f.name] = [];
    const arr: string[] = parent[f.name];
    const wrap = h('div', { class: 'adm-field' }, this.labelEl(f));
    if (f.help) wrap.append(h('p', { class: 'adm-help' }, f.help));
    const list = h('div', { class: 'adm-list' });
    const draw = () => {
      list.innerHTML = '';
      arr.forEach((s, i) => {
        const row = h('div', { class: 'adm-list-item' });
        const ta = h('textarea', { class: 'adm-input adm-textarea' }) as HTMLTextAreaElement;
        ta.value = s ?? '';
        ta.addEventListener('input', () => { arr[i] = ta.value; });
        row.append(ta, this.itemControls(arr, i, draw));
        list.append(row);
      });
    };
    const add = h('button', { type: 'button', class: 'adm-btn adm-add' }, '+ Add');
    add.addEventListener('click', () => { arr.push(''); draw(); });
    wrap.append(list, add); draw();
    return wrap;
  }

  // --- Fixed-key nested object ----------------------------------------------
  private groupField(f: SecField, parent: any): HTMLElement {
    if (typeof parent[f.name] !== 'object' || parent[f.name] == null) parent[f.name] = {};
    const obj = parent[f.name];
    const wrap = h('div', { class: 'adm-group' }, h('div', { class: 'adm-group-title' }, f.label || labelize(f.name)));
    const body = h('div', { class: 'adm-group-body' });
    for (const sub of f.fields || []) body.append(this.field(sub, obj));
    wrap.append(body);
    return wrap;
  }
}
