// Generic form renderer for any EntityDef. Produces the inputs, wires the
// markdown editor + tag pills + image upload, and reads values back out for save.
import type { EntityDef, FieldDef } from './schema';
import { MarkdownEditor } from './editor';
import { uploadFile } from './client';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

export class EntityForm {
  private editors = new Map<string, MarkdownEditor>();
  private tagState = new Map<string, string[]>();

  constructor(
    private container: HTMLElement,
    private entity: EntityDef,
    private record: Record<string, any> = {},
  ) {
    this.render();
  }

  private fieldId(name: string) {
    return `f_${this.entity.key}_${name}`;
  }

  private render() {
    const editable = this.entity.fields.filter((f) => !f.readOnly);
    this.container.innerHTML = editable.map((f) => this.fieldHtml(f)).join('');

    for (const f of editable) {
      if (f.type === 'markdown') this.mountMarkdown(f);
      if (f.type === 'tags') this.mountTags(f);
      if (f.type === 'image') this.mountImage(f);
      if (f.type === 'slug') this.mountSlug(f);
    }
  }

  private fieldHtml(f: FieldDef): string {
    const id = this.fieldId(f.name);
    const v = this.record[f.name];
    const label = `<label class="adm-label" for="${id}">${esc(f.label)}${f.required ? ' <span class="adm-req">*</span>' : ''}</label>`;
    const help = f.help ? `<p class="adm-help">${esc(f.help)}</p>` : '';
    let control = '';

    switch (f.type) {
      case 'textarea':
        control = `<textarea id="${id}" class="adm-input adm-textarea" placeholder="${esc(f.placeholder)}">${esc(v)}</textarea>`;
        break;
      case 'markdown':
        control = `<div id="${id}" class="adm-md"></div>`;
        break;
      case 'boolean':
        control = `<label class="adm-switch"><input type="checkbox" id="${id}" ${v ? 'checked' : ''}/><span>${esc(f.label)}</span></label>`;
        return `<div class="adm-field">${control}${help}</div>`;
      case 'number':
        control = `<input type="number" id="${id}" class="adm-input" value="${esc(v)}" placeholder="${esc(f.placeholder)}"/>`;
        break;
      case 'date':
        control = `<input type="date" id="${id}" class="adm-input" value="${esc((v || '').slice(0, 10))}"/>`;
        break;
      case 'datetime':
        control = `<input type="datetime-local" id="${id}" class="adm-input" value="${esc(toLocalDt(v))}"/>`;
        break;
      case 'select':
        control = `<select id="${id}" class="adm-input">${(f.options || []).map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
        break;
      case 'tags':
        control = `<div id="${id}" class="adm-tags"><div class="adm-tags-pills"></div><input type="text" class="adm-tags-input" placeholder="Add and press Enter"/></div>`;
        break;
      case 'image':
        control = `<div id="${id}" class="adm-image">
            <input type="text" class="adm-input adm-image-url" value="${esc(v)}" placeholder="Image URL or drop a file"/>
            <div class="adm-image-drop">Drop image to upload</div>
            <div class="adm-image-preview"></div>
          </div>`;
        break;
      case 'json':
        control = `<textarea id="${id}" class="adm-input adm-textarea adm-mono" placeholder='e.g. [{"label":"Website","url":"https://"}]'>${esc(typeof v === 'string' ? v : JSON.stringify(v ?? '', null, 2))}</textarea>`;
        break;
      case 'slug':
      case 'text':
      default:
        control = `<input type="text" id="${id}" class="adm-input" value="${esc(v)}" placeholder="${esc(f.placeholder)}"/>`;
    }
    return `<div class="adm-field">${label}${control}${help}</div>`;
  }

  private mountMarkdown(f: FieldDef) {
    const host = this.container.querySelector(`#${this.fieldId(f.name)}`) as HTMLElement;
    const ed = new MarkdownEditor(host, {
      value: this.record[f.name] ?? '',
      onUploadImage: (file) => uploadFile(this.entity.table, this.imageField(), file),
    });
    this.editors.set(f.name, ed);
  }

  private mountTags(f: FieldDef) {
    const host = this.container.querySelector(`#${this.fieldId(f.name)}`) as HTMLElement;
    const pills = host.querySelector('.adm-tags-pills') as HTMLElement;
    const input = host.querySelector('.adm-tags-input') as HTMLInputElement;
    let tags: string[] = Array.isArray(this.record[f.name])
      ? this.record[f.name]
      : typeof this.record[f.name] === 'string' && this.record[f.name]
        ? safeParseTags(this.record[f.name])
        : [];
    this.tagState.set(f.name, tags);

    const draw = () => {
      pills.innerHTML = tags.map((t, i) => `<span class="adm-pill">${esc(t)}<button type="button" data-i="${i}">×</button></span>`).join('');
      pills.querySelectorAll('button').forEach((b) =>
        b.addEventListener('click', () => { tags.splice(Number((b as HTMLElement).dataset.i), 1); this.tagState.set(f.name, tags); draw(); }));
    };
    const add = (raw: string) => {
      raw.split(',').map((s) => s.trim()).filter(Boolean).forEach((t) => { if (!tags.includes(t)) tags.push(t); });
      this.tagState.set(f.name, tags);
      input.value = '';
      draw();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input.value); }
      else if (e.key === 'Backspace' && !input.value && tags.length) { tags.pop(); this.tagState.set(f.name, tags); draw(); }
    });
    input.addEventListener('blur', () => { if (input.value.trim()) add(input.value); });
    draw();
  }

  private mountImage(f: FieldDef) {
    const host = this.container.querySelector(`#${this.fieldId(f.name)}`) as HTMLElement;
    const urlInput = host.querySelector('.adm-image-url') as HTMLInputElement;
    const drop = host.querySelector('.adm-image-drop') as HTMLElement;
    const preview = host.querySelector('.adm-image-preview') as HTMLElement;
    const showPreview = () => {
      const u = urlInput.value.trim();
      preview.innerHTML = u ? `<img src="${esc(u)}" alt="preview"/>` : '';
    };
    urlInput.addEventListener('input', showPreview);
    showPreview();

    const upload = async (file: File) => {
      drop.textContent = `Uploading ${file.name}…`;
      try {
        urlInput.value = await uploadFile(this.entity.table, f.name, file);
        showPreview();
      } catch (err) {
        drop.textContent = `Upload failed: ${(err as Error).message}`;
        return;
      }
      drop.textContent = 'Drop image to upload';
    };
    ['dragover', 'dragenter'].forEach((ev) => host.addEventListener(ev, (e) => { e.preventDefault(); host.classList.add('adm-dragging'); }));
    ['dragleave', 'drop'].forEach((ev) => host.addEventListener(ev, (e) => { e.preventDefault(); host.classList.remove('adm-dragging'); }));
    host.addEventListener('drop', (e) => {
      const file = (e as DragEvent).dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) upload(file);
    });
  }

  // keep slug in sync with its source field until the user edits the slug directly
  private mountSlug(f: FieldDef) {
    if (!f.slugFrom) return;
    const slugEl = this.container.querySelector(`#${this.fieldId(f.name)}`) as HTMLInputElement;
    const srcEl = this.container.querySelector(`#${this.fieldId(f.slugFrom)}`) as HTMLInputElement;
    if (!slugEl || !srcEl) return;
    let touched = !!slugEl.value;
    slugEl.addEventListener('input', () => { touched = true; });
    srcEl.addEventListener('input', () => { if (!touched) slugEl.value = slugify(srcEl.value); });
  }

  private imageField(): string {
    const img = this.entity.fields.find((f) => f.type === 'image');
    return img?.name || 'cover_image';
  }

  /** Collect the form values to send to the API. */
  values(): Record<string, any> {
    const out: Record<string, any> = {};
    for (const f of this.entity.fields) {
      if (f.readOnly) continue;
      const el = this.container.querySelector(`#${this.fieldId(f.name)}`) as any;
      switch (f.type) {
        case 'markdown':
          out[f.name] = this.editors.get(f.name)?.value ?? '';
          break;
        case 'boolean':
          out[f.name] = !!el?.checked;
          break;
        case 'number':
          out[f.name] = el?.value === '' ? null : Number(el.value);
          break;
        case 'tags':
          out[f.name] = JSON.stringify(this.tagState.get(f.name) ?? []);
          break;
        case 'image':
          out[f.name] = (el.querySelector('.adm-image-url') as HTMLInputElement).value.trim();
          break;
        case 'datetime':
          out[f.name] = el?.value ? new Date(el.value).toISOString() : null;
          break;
        case 'json':
          try { out[f.name] = el?.value ? JSON.stringify(JSON.parse(el.value)) : null; }
          catch { out[f.name] = el?.value ?? null; }
          break;
        default:
          out[f.name] = el?.value ?? '';
      }
    }
    return out;
  }
}

function toLocalDt(v: any): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function safeParseTags(s: string): string[] {
  try { const p = JSON.parse(s); return Array.isArray(p) ? p : []; }
  catch { return s.split(',').map((x) => x.trim()).filter(Boolean); }
}
