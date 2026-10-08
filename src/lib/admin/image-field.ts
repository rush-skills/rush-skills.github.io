// Shared cover/image field: URL text box + real file picker + drag-drop.
// Used by the section CMS (projects, site OG, …) and the table editors (posts).
// A browser-automation agent can target `input[type=file][accept="image/*"]`.

export interface ImageFieldOpts {
  /** Called whenever the URL changes (type, paste, or successful upload). */
  onChange?: (url: string) => void;
  upload: (file: File) => Promise<string>;
}

function setStatus(el: HTMLElement | null, text: string, kind: '' | 'ok' | 'err' = '') {
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('adm-image-status-ok', kind === 'ok');
  el.classList.toggle('adm-image-status-err', kind === 'err');
}

function preview(host: HTMLElement, url: string) {
  const box = host.querySelector('.adm-image-preview') as HTMLElement | null;
  if (!box) return;
  box.innerHTML = '';
  const u = url.trim();
  if (!u) return;
  const img = document.createElement('img');
  img.src = u;
  img.alt = '';
  box.appendChild(img);
}

/** Wire an existing `.adm-image` host (URL input + file input + drop zone). */
export function wireImageField(host: HTMLElement, opts: ImageFieldOpts): HTMLInputElement {
  const urlInput = host.querySelector('.adm-image-url') as HTMLInputElement;
  const fileInput = host.querySelector('.adm-image-file') as HTMLInputElement;
  const chooseBtn = host.querySelector('.adm-image-choose') as HTMLButtonElement | null;
  const drop = host.querySelector('.adm-image-drop') as HTMLElement | null;
  const status = host.querySelector('.adm-image-status') as HTMLElement | null;

  const openPicker = () => fileInput?.click();

  const upload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setStatus(status, 'Please choose an image file.', 'err');
      return;
    }
    setStatus(status, `Uploading ${file.name}…`);
    if (drop) drop.textContent = `Uploading ${file.name}…`;
    try {
      const url = await opts.upload(file);
      if (!url) throw new Error('Upload returned no URL');
      urlInput.value = url;
      opts.onChange?.(url.trim());
      preview(host, url);
      setStatus(status, 'Uploaded.', 'ok');
      if (drop) drop.textContent = 'Drop image to upload, or click to choose a file';
    } catch (err) {
      const msg = (err as Error).message || 'Upload failed';
      setStatus(status, msg, 'err');
      if (drop) drop.textContent = `Upload failed: ${msg}`;
    }
  };

  urlInput.addEventListener('input', () => {
    opts.onChange?.(urlInput.value.trim());
    preview(host, urlInput.value);
    setStatus(status, '');
  });

  chooseBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openPicker();
  });

  drop?.addEventListener('click', (e) => {
    // Don't steal clicks from the choose button if it's nested.
    if ((e.target as HTMLElement).closest('.adm-image-choose')) return;
    openPicker();
  });
  drop?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) upload(file);
    fileInput.value = '';
  });

  ['dragover', 'dragenter'].forEach((ev) =>
    host.addEventListener(ev, (e) => { e.preventDefault(); host.classList.add('adm-dragging'); }));
  ['dragleave', 'drop'].forEach((ev) =>
    host.addEventListener(ev, (e) => { e.preventDefault(); host.classList.remove('adm-dragging'); }));
  host.addEventListener('drop', (e) => {
    const file = (e as DragEvent).dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) upload(file);
  });

  preview(host, urlInput.value);
  return urlInput;
}

/** Build the DOM for a CMS image field (SectionForm). */
export function buildImageControl(
  initial: string,
  onChange: (url: string) => void,
  upload: (file: File) => Promise<string>,
): HTMLElement {
  const host = document.createElement('div');
  host.className = 'adm-image';
  host.innerHTML = imageFieldInnerHtml(initial);
  wireImageField(host, { onChange, upload });
  return host;
}

export function imageFieldInnerHtml(value: string): string {
  const esc = (s: unknown) =>
    String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  return `
    <input type="text" class="adm-input adm-image-url" value="${esc(value)}" placeholder="Image URL or upload a file"/>
    <div class="adm-image-actions">
      <input type="file" accept="image/*" class="adm-image-file" />
      <button type="button" class="adm-btn adm-image-choose">Upload</button>
      <div class="adm-image-drop" role="button" tabindex="0">Drop image to upload, or click to choose a file</div>
    </div>
    <p class="adm-image-status" aria-live="polite"></p>
    <div class="adm-image-preview"></div>`;
}
