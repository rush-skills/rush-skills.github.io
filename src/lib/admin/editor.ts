// A self-contained markdown editor: toolbar + textarea + live split preview,
// keyboard shortcuts, and drag/paste image upload. No heavy editor dependency —
// an enhanced <textarea> keeps the Worker bundle small and reliable. `marked`
// renders the preview (already a project dependency).
import { marked } from 'marked';

export interface MarkdownEditorOptions {
  value?: string;
  onChange?: (value: string) => void;
  onUploadImage?: (file: File) => Promise<string>;
}

marked.setOptions({ gfm: true, breaks: false });

export class MarkdownEditor {
  el: HTMLElement;
  private textarea!: HTMLTextAreaElement;
  private preview!: HTMLElement;
  private opts: MarkdownEditorOptions;

  constructor(container: HTMLElement, opts: MarkdownEditorOptions = {}) {
    this.el = container;
    this.opts = opts;
    this.render(opts.value ?? '');
  }

  get value(): string {
    return this.textarea.value;
  }
  set value(v: string) {
    this.textarea.value = v;
    this.updatePreview();
  }

  private render(initial: string) {
    this.el.innerHTML = `
      <div class="md-editor">
        <div class="md-toolbar" role="toolbar" aria-label="Formatting">
          <button type="button" data-md="bold" title="Bold (Ctrl/Cmd+B)"><b>B</b></button>
          <button type="button" data-md="italic" title="Italic (Ctrl/Cmd+I)"><i>I</i></button>
          <button type="button" data-md="h2" title="Heading">H2</button>
          <button type="button" data-md="h3" title="Subheading">H3</button>
          <span class="md-sep"></span>
          <button type="button" data-md="link" title="Link (Ctrl/Cmd+K)">🔗</button>
          <button type="button" data-md="code" title="Inline code">‹/›</button>
          <button type="button" data-md="pre" title="Code block">{ }</button>
          <button type="button" data-md="quote" title="Quote">❝</button>
          <button type="button" data-md="ul" title="Bullet list">•</button>
          <button type="button" data-md="ol" title="Numbered list">1.</button>
          <span class="md-sep"></span>
          <button type="button" data-md="image" title="Upload image">🖼️</button>
          <span class="md-spacer"></span>
          <button type="button" data-md="toggle-preview" title="Toggle preview" class="md-toggle">Preview</button>
        </div>
        <div class="md-panes">
          <textarea class="md-input" spellcheck="true" placeholder="Write in Markdown…"></textarea>
          <div class="md-preview post-body" aria-live="polite"></div>
        </div>
        <input type="file" accept="image/*" class="md-file" hidden />
        <div class="md-drop-hint">Drop image to upload</div>
      </div>`;

    this.textarea = this.el.querySelector('.md-input') as HTMLTextAreaElement;
    this.preview = this.el.querySelector('.md-preview') as HTMLElement;
    const fileInput = this.el.querySelector('.md-file') as HTMLInputElement;
    this.textarea.value = initial;
    this.updatePreview();

    this.textarea.addEventListener('input', () => {
      this.updatePreview();
      this.opts.onChange?.(this.value);
    });

    this.textarea.addEventListener('keydown', (e) => this.onKeydown(e));

    this.el.querySelectorAll('.md-toolbar button').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const cmd = (btn as HTMLElement).dataset.md!;
        if (cmd === 'image') fileInput.click();
        else if (cmd === 'toggle-preview') this.el.querySelector('.md-editor')!.classList.toggle('md-preview-only');
        else this.applyCommand(cmd);
      });
    });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (file) await this.handleImage(file);
      fileInput.value = '';
    });

    // Drag & drop + paste image
    const editor = this.el.querySelector('.md-editor') as HTMLElement;
    ['dragover', 'dragenter'].forEach((ev) =>
      editor.addEventListener(ev, (e) => { e.preventDefault(); editor.classList.add('md-dragging'); }));
    ['dragleave', 'drop'].forEach((ev) =>
      editor.addEventListener(ev, (e) => { e.preventDefault(); editor.classList.remove('md-dragging'); }));
    editor.addEventListener('drop', async (e) => {
      const file = (e as DragEvent).dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) await this.handleImage(file);
    });
    this.textarea.addEventListener('paste', async (e) => {
      const item = Array.from((e as ClipboardEvent).clipboardData?.items || []).find((i) => i.type.startsWith('image/'));
      if (item) {
        const file = item.getAsFile();
        if (file) { e.preventDefault(); await this.handleImage(file); }
      }
    });
  }

  private updatePreview() {
    const out = marked.parse(this.textarea.value || '*Nothing to preview yet.*');
    Promise.resolve(out).then((html) => { this.preview.innerHTML = html as string; });
  }

  private onKeydown(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); this.applyCommand('bold'); }
    else if (mod && e.key.toLowerCase() === 'i') { e.preventDefault(); this.applyCommand('italic'); }
    else if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); this.applyCommand('link'); }
    else if (e.key === 'Tab') {
      // soft-tab (2 spaces), don't trap focus on shift+tab
      if (!e.shiftKey) { e.preventDefault(); this.insertAtCursor('  '); }
    }
  }

  private getSelection() {
    return { start: this.textarea.selectionStart, end: this.textarea.selectionEnd, text: this.textarea.value };
  }

  private replaceSelection(replacement: string, selectInner?: [number, number]) {
    const { start, end, text } = this.getSelection();
    this.textarea.value = text.slice(0, start) + replacement + text.slice(end);
    if (selectInner) {
      this.textarea.selectionStart = start + selectInner[0];
      this.textarea.selectionEnd = start + selectInner[1];
    } else {
      this.textarea.selectionStart = this.textarea.selectionEnd = start + replacement.length;
    }
    this.textarea.focus();
    this.updatePreview();
    this.opts.onChange?.(this.value);
  }

  private insertAtCursor(s: string) {
    this.replaceSelection(s);
  }

  private wrap(before: string, after = before, placeholder = '') {
    const { start, end, text } = this.getSelection();
    const sel = text.slice(start, end) || placeholder;
    this.replaceSelection(`${before}${sel}${after}`, [before.length, before.length + sel.length]);
  }

  private linePrefix(prefix: string) {
    const { start, end, text } = this.getSelection();
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const block = text.slice(lineStart, end);
    const numbered = prefix === '1. ';
    const newBlock = block
      .split('\n')
      .map((l, i) => (numbered ? `${i + 1}. ` : prefix) + l.replace(/^(\s*([-*]|\d+\.)\s+|#{1,6}\s+|>\s+)/, ''))
      .join('\n');
    this.textarea.value = text.slice(0, lineStart) + newBlock + text.slice(end);
    this.textarea.focus();
    this.updatePreview();
    this.opts.onChange?.(this.value);
  }

  private applyCommand(cmd: string) {
    switch (cmd) {
      case 'bold': return this.wrap('**', '**', 'bold text');
      case 'italic': return this.wrap('*', '*', 'italic text');
      case 'code': return this.wrap('`', '`', 'code');
      case 'pre': return this.wrap('\n```\n', '\n```\n', 'code block');
      case 'h2': return this.linePrefix('## ');
      case 'h3': return this.linePrefix('### ');
      case 'quote': return this.linePrefix('> ');
      case 'ul': return this.linePrefix('- ');
      case 'ol': return this.linePrefix('1. ');
      case 'link': {
        const { start, end, text } = this.getSelection();
        const sel = text.slice(start, end) || 'link text';
        return this.replaceSelection(`[${sel}](https://)`, [sel.length + 3, sel.length + 11]);
      }
    }
  }

  private async handleImage(file: File) {
    if (!this.opts.onUploadImage) {
      this.insertAtCursor(`\n![${file.name}](upload-not-configured)\n`);
      return;
    }
    const placeholder = `\n![uploading ${file.name}…]()\n`;
    this.insertAtCursor(placeholder);
    try {
      const url = await this.opts.onUploadImage(file);
      this.textarea.value = this.textarea.value.replace(placeholder, `\n![${file.name}](${url})\n`);
    } catch (err) {
      this.textarea.value = this.textarea.value.replace(placeholder, `\n<!-- image upload failed: ${(err as Error).message} -->\n`);
    }
    this.updatePreview();
    this.opts.onChange?.(this.value);
  }
}
