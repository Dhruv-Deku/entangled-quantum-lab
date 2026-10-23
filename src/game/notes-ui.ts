import type { UIKitMLAsset } from '@iwsdk/core';
import { speakable } from './notes';

type El = ReturnType<UIKitMLAsset['requireElementById']>;

const PER_PAGE = 3;
const KEY = '#3ddc97';
const TEXT = '#c9ccd1';

/**
 * The Notes panel: a page of plain-English explanation at a time, Back/Next,
 * and Listen, which reads the page aloud with the browser's speech engine
 * (reading long text in a headset is tiring). Speech stops when the page
 * changes or the panel closes.
 */
export class NotesPanel {
  open = false;
  /** Title of the notes on show, so a re-render does not jump back to page one. */
  title = '';
  private els = new Map<string, El>();
  private paras: string[] = [];
  private page = 0;
  private speaking = false;
  readonly canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

  constructor(readonly asset: UIKitMLAsset, private onChange: () => void, onZoom: () => void) {
    for (const id of ['notes-eyebrow', 'notes-page', 'notes-title', 'notes-p-0', 'notes-p-1', 'notes-p-2', 'notes-prev', 'notes-next', 'notes-next-label', 'notes-listen', 'notes-listen-label', 'notes-zoom', 'notes-zoom-label', 'notes-close']) {
      const el = asset.requireElementById(id);
      el.name = id;
      this.els.set(id, el);
    }
    const on = (id: string, fn: () => void) => this.els.get(id)!.addEventListener('click', fn);
    on('notes-prev', () => this.turn(-1));
    on('notes-next', () => (this.page + 1 < this.pages ? this.turn(1) : this.close()));
    on('notes-listen', () => this.toggleSpeech());
    on('notes-close', () => this.close());
    on('notes-zoom', onZoom);
    this.els.get('notes-listen')!.setProperties({ display: this.canSpeak ? 'flex' : 'none' });
  }

  private get pages(): number {
    return Math.max(1, Math.ceil(this.paras.length / PER_PAGE));
  }

  show(eyebrow: string, title: string, paras: string[]): void {
    this.stopSpeech();
    this.paras = paras;
    this.page = 0;
    this.open = true;
    this.title = title;
    this.text('notes-eyebrow', eyebrow);
    this.text('notes-title', title);
    this.render();
  }

  close(): void {
    this.stopSpeech();
    this.open = false;
    this.onChange();
  }

  /** Zoom is shared with the code window; this only updates the button. */
  setZoomed(zoomed: boolean): void {
    this.text('notes-zoom-label', zoomed ? 'Unzoom' : 'Zoom');
    this.els.get('notes-zoom')?.setProperties({ backgroundColor: zoomed ? '#2d7ff9' : '#34363b' });
  }

  /** The I key: open, then next page, then close after the last page. */
  advance(): void {
    if (this.page + 1 < this.pages) this.turn(1);
    else this.close();
  }

  private turn(dir: number): void {
    this.stopSpeech();
    this.page = Math.max(0, Math.min(this.pages - 1, this.page + dir));
    this.render();
  }

  private render(): void {
    const slice = this.paras.slice(this.page * PER_PAGE, this.page * PER_PAGE + PER_PAGE);
    for (let i = 0; i < PER_PAGE; i++) {
      const p = slice[i];
      const key = !!p && p.startsWith('Key idea');
      this.els.get(`notes-p-${i}`)?.setProperties({ display: p ? 'flex' : 'none', text: p ?? ' ', color: key ? KEY : TEXT, fontWeight: key ? 600 : 400 });
    }
    this.text('notes-page', `${this.page + 1} of ${this.pages}`);
    this.text('notes-next-label', this.page + 1 < this.pages ? 'Next' : 'Done');
    this.els.get('notes-prev')?.setProperties({ display: this.page > 0 ? 'flex' : 'none' });
    this.text('notes-listen-label', this.speaking ? 'Stop' : 'Listen');
    this.onChange();
  }

  private toggleSpeech(): void {
    if (this.speaking) {
      this.stopSpeech();
      this.render();
      return;
    }
    if (!this.canSpeak) return;
    try {
      const page = this.paras.slice(this.page * PER_PAGE, this.page * PER_PAGE + PER_PAGE).join(' ');
      const u = new SpeechSynthesisUtterance(speakable(page));
      u.lang = 'en-US';
      u.rate = 0.95;
      u.onend = () => {
        this.speaking = false;
        if (this.open) this.render();
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
      this.speaking = true;
    } catch {
      this.speaking = false;
    }
    this.render();
  }

  private stopSpeech(): void {
    if (!this.speaking) return;
    this.speaking = false;
    try {
      window.speechSynthesis.cancel();
    } catch {
      // nothing to stop
    }
  }

  private text(id: string, text: string): void {
    this.els.get(id)?.setProperties({ text });
  }
}
