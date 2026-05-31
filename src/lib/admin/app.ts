// Admin SPA controller: auth gate, hash routing, and list/edit views rendered
// generically from ENTITIES. Mounted by /admin.
import { ENTITIES, entityByKey, type EntityDef } from './schema';
import { SECTION_DEFS, getSectionDef, type SectionDef } from './sections';
import * as api from './client';
import { EntityForm } from './form';
import { SectionForm } from './section-form';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T =>
  root.querySelector(sel) as T;

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

export class AdminApp {
  private root: HTMLElement;
  private current?: { form: EntityForm; entity: EntityDef; id?: string };

  constructor(root: HTMLElement) {
    this.root = root;
    window.addEventListener('hashchange', () => this.route());
    this.boot();
  }

  private boot() {
    if (!api.isAuthed()) return this.renderLogin();
    this.renderShell();
    if (!location.hash || location.hash === '#') location.hash = `#/content/${SECTION_DEFS[0].section}`;
    else this.route();
  }

  // --- Auth -----------------------------------------------------------------
  private renderLogin(error = '') {
    this.root.innerHTML = `
      <div class="adm-auth">
        <form class="adm-auth-card" id="login-form">
          <h1 class="adm-auth-title">anks.in admin</h1>
          <p class="adm-auth-sub">Sign in to manage content.</p>
          ${error ? `<div class="adm-error">${esc(error)}</div>` : ''}
          <label class="adm-label" for="email">Email</label>
          <input class="adm-input" id="email" type="email" autocomplete="username" required />
          <label class="adm-label" for="password">Password</label>
          <input class="adm-input" id="password" type="password" autocomplete="current-password" required />
          <button class="adm-btn adm-btn-primary adm-btn-block" type="submit">Sign in</button>
        </form>
      </div>`;
    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type=submit]', this.root) as HTMLButtonElement;
      btn.disabled = true; btn.textContent = 'Signing in…';
      try {
        await api.login(($('#email') as HTMLInputElement).value, ($('#password') as HTMLInputElement).value);
        this.boot();
      } catch (err) {
        this.renderLogin((err as Error).message || 'Login failed');
      }
    });
  }

  // --- Shell ----------------------------------------------------------------
  private renderShell() {
    const user = api.getUser();
    this.root.innerHTML = `
      <div class="adm-shell">
        <aside class="adm-side">
          <div class="adm-brand">anks.in <span>admin</span></div>
          <nav class="adm-nav">
            <div class="adm-nav-group">Site content</div>
            ${SINGLETON_SECTIONS.map(secNavLink).join('')}
            <div class="adm-nav-group">Collections</div>
            ${ENTITIES.filter((e) => e.enabled).map((e) => `
              <a href="#/${e.key}" data-key="${e.key}" class="adm-nav-link">${esc(e.labelPlural)}</a>`).join('')}
            ${COLLECTION_SECTIONS.map(secNavLink).join('')}
          </nav>
          <div class="adm-side-foot">
            <a href="/" class="adm-nav-link" target="_blank">View site ↗</a>
            <button class="adm-nav-link adm-logout" id="logout">Sign out${user?.email ? ` (${esc(user.email)})` : ''}</button>
          </div>
        </aside>
        <main class="adm-main" id="adm-main"></main>
      </div>`;
    $('#logout').addEventListener('click', () => { api.logout(); this.boot(); });
  }

  private setActiveNav(key: string) {
    this.root.querySelectorAll('.adm-nav-link').forEach((a) =>
      a.classList.toggle('adm-active', (a as HTMLElement).dataset.key === key));
  }

  // --- Routing --------------------------------------------------------------
  private route() {
    if (!api.isAuthed()) return this.boot();
    const hash = location.hash;
    const cm = hash.match(/^#\/content\/([\w-]+)$/);
    if (cm) {
      const def = getSectionDef(cm[1]);
      if (def) { this.setActiveNav(`content:${def.section}`); this.renderSection(def); return; }
    }
    const m = hash.match(/^#\/([\w-]+)(?:\/(new|[^/]+))?$/);
    const fallback = `#/content/${SECTION_DEFS[0].section}`;
    if (!m) { location.hash = fallback; return; }
    const entity = entityByKey(m[1]);
    if (!entity) { location.hash = fallback; return; }
    this.setActiveNav(entity.key);
    if (m[2] === 'new') this.renderEdit(entity);
    else if (m[2]) this.renderEdit(entity, m[2]);
    else this.renderList(entity);
  }

  private main() { return $('#adm-main'); }

  private skeletonRows(n = 5) {
    return `<div class="adm-skel-list">${Array.from({ length: n }).map(() => `<div class="adm-skel-row"></div>`).join('')}</div>`;
  }

  // --- List view ------------------------------------------------------------
  private async renderList(entity: EntityDef) {
    const main = this.main();
    main.innerHTML = `
      <div class="adm-head">
        <h1>${esc(entity.labelPlural)}</h1>
        ${entity.enabled ? `<a class="adm-btn adm-btn-primary" href="#/${entity.key}/new">+ New ${esc(entity.labelSingular)}</a>` : ''}
      </div>
      <div id="list-body">${this.skeletonRows()}</div>`;

    if (!entity.enabled) {
      $('#list-body').innerHTML = `<div class="adm-empty"><p>The <strong>${esc(entity.labelPlural)}</strong> table isn't set up yet.</p><p class="adm-help">It will appear here once migrated into teenybase (phase 2).</p></div>`;
      return;
    }

    try {
      const rows = await api.list(entity.table, { order: entity.defaultOrder, limit: 200 });
      if (!rows.length) {
        $('#list-body').innerHTML = `<div class="adm-empty"><p>No ${esc(entity.labelPlural.toLowerCase())} yet.</p><a class="adm-btn adm-btn-primary" href="#/${entity.key}/new">Create the first one</a></div>`;
        return;
      }
      const cols = entity.listColumns;
      $('#list-body').innerHTML = `
        <table class="adm-table">
          <thead><tr>${cols.map((c) => `<th>${esc(labelFor(entity, c))}</th>`).join('')}<th></th></tr></thead>
          <tbody>
            ${rows.map((r) => `
              <tr data-id="${esc(r.id)}">
                ${cols.map((c, i) => `<td>${i === 0
                  ? `<a href="#/${entity.key}/${esc(r.id)}" class="adm-link">${esc(cell(r, c)) || '<em>untitled</em>'}</a>`
                  : esc(cell(r, c))}</td>`).join('')}
                <td class="adm-row-actions">
                  <a class="adm-icon-btn" href="#/${entity.key}/${esc(r.id)}" title="Edit">✎</a>
                  <button class="adm-icon-btn adm-danger" data-del="${esc(r.id)}" title="Delete">🗑</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>`;
      main.querySelectorAll('[data-del]').forEach((b) =>
        b.addEventListener('click', () => this.confirmDelete(entity, (b as HTMLElement).dataset.del!)));
    } catch (err) {
      $('#list-body').innerHTML = `<div class="adm-error">Couldn't load ${esc(entity.labelPlural)}: ${esc((err as Error).message)}</div>`;
    }
  }

  private async confirmDelete(entity: EntityDef, id: string) {
    if (!confirm(`Delete this ${entity.labelSingular.toLowerCase()}? This can't be undone.`)) return;
    try { await api.remove(entity.table, id); this.renderList(entity); }
    catch (err) { alert(`Delete failed: ${(err as Error).message}`); }
  }

  // --- CMS section editor ---------------------------------------------------
  private async renderSection(def: SectionDef) {
    const main = this.main();
    main.innerHTML = `
      <div class="adm-head">
        <div class="adm-head-left">
          <h1>${esc(def.label)}</h1>
          ${def.description ? `<p class="adm-sub">${esc(def.description)}</p>` : ''}
        </div>
        <div class="adm-head-actions">
          <button class="adm-btn" id="preview-btn" title="Save a draft and open the site showing it">Preview ↗</button>
          <button class="adm-btn" id="draft-btn">Save draft</button>
          <button class="adm-btn adm-btn-primary" id="publish-btn">Publish</button>
        </div>
      </div>
      <div class="adm-form" id="form-body">${this.skeletonRows(5)}</div>
      <div class="adm-save-bar"><span id="save-status"></span></div>`;

    let row: api.SectionRow | null = null;
    try { row = await api.getSection(def.section); }
    catch (err) {
      $('#form-body').innerHTML = `<div class="adm-error">Couldn't load section: ${esc((err as Error).message)}</div>`;
      return;
    }
    const data = row?.draft ?? row?.published ?? {};
    $('#form-body').innerHTML = '';
    const form = new SectionForm($('#form-body'), def, data);

    const status = $('#save-status');
    const saveDraft = async (): Promise<boolean> => {
      try { await api.saveSectionDraft(def.section, form.value()); return true; }
      catch (err) { status.innerHTML = `<span class="adm-error-inline">${esc((err as Error).message)}</span>`; return false; }
    };

    $('#draft-btn').addEventListener('click', async () => {
      const btn = $('#draft-btn') as HTMLButtonElement;
      btn.disabled = true; btn.textContent = 'Saving…'; status.textContent = '';
      if (await saveDraft()) status.innerHTML = '<span class="adm-ok">Draft saved ✓ — Preview to see it, Publish to go live.</span>';
      btn.disabled = false; btn.textContent = 'Save draft';
    });

    $('#publish-btn').addEventListener('click', async () => {
      const btn = $('#publish-btn') as HTMLButtonElement;
      btn.disabled = true; btn.textContent = 'Publishing…'; status.textContent = '';
      try {
        await api.publishSection(def.section, form.value());
        status.innerHTML = '<span class="adm-ok">Published ✓ — live on the site now.</span>';
      } catch (err) {
        status.innerHTML = `<span class="adm-error-inline">${esc((err as Error).message)}</span>`;
      }
      btn.disabled = false; btn.textContent = 'Publish';
    });

    $('#preview-btn').addEventListener('click', async () => {
      const btn = $('#preview-btn') as HTMLButtonElement;
      btn.disabled = true; btn.textContent = 'Saving…';
      const ok = await saveDraft();
      btn.disabled = false; btn.textContent = 'Preview ↗';
      if (!ok) return;
      document.cookie = 'tb_preview=1; Path=/; SameSite=Lax; Max-Age=3600';
      window.open('/', '_blank');
    });

    main.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); ($('#draft-btn') as HTMLButtonElement).click(); }
    });
  }

  // --- Edit / create view ---------------------------------------------------
  private async renderEdit(entity: EntityDef, id?: string) {
    const main = this.main();
    const isNew = !id;
    main.innerHTML = `
      <div class="adm-head">
        <div class="adm-head-left">
          <a href="#/${entity.key}" class="adm-back">← ${esc(entity.labelPlural)}</a>
          <h1>${isNew ? 'New' : 'Edit'} ${esc(entity.labelSingular)}</h1>
        </div>
        <div class="adm-head-actions">
          ${!isNew ? `<button class="adm-btn adm-danger-btn" id="del-btn">Delete</button>` : ''}
          <button class="adm-btn adm-btn-primary" id="save-btn">Save</button>
        </div>
      </div>
      <div class="adm-form" id="form-body">${this.skeletonRows(4)}</div>
      <div class="adm-save-bar"><span id="save-status"></span></div>`;

    let record: Record<string, any> = {};
    if (!isNew) {
      try { record = await api.view(entity.table, id!); }
      catch (err) {
        $('#form-body').innerHTML = `<div class="adm-error">Couldn't load record: ${esc((err as Error).message)}</div>`;
        return;
      }
    }

    $('#form-body').innerHTML = '';
    const form = new EntityForm($('#form-body'), entity, record);
    this.current = { form, entity, id };

    $('#save-btn').addEventListener('click', () => this.save(entity, id));
    const del = $('#del-btn');
    if (del) del.addEventListener('click', () => this.confirmDelete(entity, id!));

    // Ctrl/Cmd+S to save
    main.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); this.save(entity, id); }
    });
  }

  private async save(entity: EntityDef, id?: string) {
    if (!this.current) return;
    const status = $('#save-status');
    const btn = $('#save-btn') as HTMLButtonElement;
    const values = this.current.form.values();

    // Required-field check
    const missing = entity.fields.filter((f) => f.required && !String(values[f.name] ?? '').trim());
    if (missing.length) {
      status.innerHTML = `<span class="adm-error-inline">Required: ${missing.map((f) => esc(f.label)).join(', ')}</span>`;
      return;
    }

    // Entity-specific defaults
    if (entity.table === 'posts') {
      const user = api.getUser();
      if (!id && user?.id) values.author_id = user.id;
      if (values.published && !values.published_at) values.published_at = new Date().toISOString();
    }

    btn.disabled = true; btn.textContent = 'Saving…'; status.textContent = '';
    try {
      const saved = id ? await api.edit(entity.table, id, values) : await api.insert(entity.table, values);
      status.innerHTML = `<span class="adm-ok">Saved ✓</span>`;
      if (!id && saved?.id) location.hash = `#/${entity.key}/${saved.id}`;
    } catch (err) {
      status.innerHTML = `<span class="adm-error-inline">${esc((err as Error).message)}</span>`;
    } finally {
      btn.disabled = false; btn.textContent = 'Save';
    }
  }
}

function labelFor(entity: EntityDef, field: string): string {
  return entity.fields.find((f) => f.name === field)?.label ?? field;
}

function cell(row: Record<string, any>, field: string): string {
  const v = row[field];
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (field === 'published') return v ? 'Published' : 'Draft';
  if ((field === 'published_at' || field.endsWith('_at') || field === 'created' || field === 'updated') && v) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  if (Array.isArray(v)) return v.join(', ');
  return v == null ? '' : String(v);
}
