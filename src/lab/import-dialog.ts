import { parseCircuit, ImportError, type Imported } from '../quantum/importer';
import { SHARE_PREFIX } from '../quantum/share';

/**
 * The import dialog on the 2D page (a headset browser shows the page before
 * Enter XR): paste OpenQASM or Qiskit code, name it, or scan a share-link QR
 * code with the camera where the browser can (BarcodeDetector).
 */

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

const STYLE =
  'position:fixed;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;background:rgba(10,11,13,.55);' +
  'font:14px/1.45 Inter,system-ui,sans-serif;color:#e4e6eb';
const CARD = 'width:min(560px,92vw);background:#1b1c1f;border:1px solid #34363b;border-radius:20px;padding:20px 22px;display:flex;flex-direction:column;gap:12px';
const INPUT = 'background:#242528;color:#e4e6eb;border:1px solid #34363b;border-radius:12px;padding:10px 12px;font:13px/1.4 ui-monospace,Consolas,monospace';
const BTN = 'height:36px;padding:0 16px;border-radius:18px;border:none;font:600 14px Inter,system-ui,sans-serif;cursor:pointer';

let open: HTMLDivElement | null = null;

/** Show the dialog. onImport gets the parsed circuit and its name. */
export function openImportDialog(onImport: (c: Imported, name: string) => void): void {
  if (open) return;
  const wrap = document.createElement('div');
  wrap.style.cssText = STYLE;
  wrap.innerHTML = `<div style="${CARD}">
    <div style="font-weight:700;font-size:20px">Import a circuit</div>
    <div style="color:#b8bbc1">Paste OpenQASM 2 or 3, or Qiskit code (up to 5 qubits). It opens in the sandbox and is saved to My circuits.</div>
    <input id="imp-name" placeholder="Name (optional)" style="${INPUT}">
    <textarea id="imp-text" rows="10" placeholder="OPENQASM 3.0;&#10;include &quot;stdgates.inc&quot;;&#10;qubit[2] q;&#10;h q[0];&#10;cx q[0], q[1];" style="${INPUT};resize:vertical"></textarea>
    <div id="imp-error" style="color:#ff8a7a;min-height:20px"></div>
    <video id="imp-video" playsinline muted style="display:none;width:100%;border-radius:12px;background:#000"></video>
    <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
      <button id="imp-scan" style="${BTN};background:#34363b;color:#e4e6eb;display:none">Scan a QR code</button>
      <button id="imp-cancel" style="${BTN};background:#34363b;color:#e4e6eb">Cancel</button>
      <button id="imp-go" style="${BTN};background:#2d7ff9;color:#fff">Import</button>
    </div></div>`;
  document.body.appendChild(wrap);
  open = wrap;
  const $ = <T extends HTMLElement>(id: string) => wrap.querySelector<T>(`#${id}`)!;
  const error = $('imp-error');
  let stream: MediaStream | null = null;
  const close = () => {
    stream?.getTracks().forEach((t) => t.stop());
    wrap.remove();
    open = null;
  };
  $('imp-cancel').onclick = close;
  wrap.onclick = (e) => {
    if (e.target === wrap) close();
  };
  $('imp-go').onclick = () => {
    try {
      const c = parseCircuit($<HTMLTextAreaElement>('imp-text').value);
      onImport(c, $<HTMLInputElement>('imp-name').value.trim());
      close();
    } catch (err) {
      error.textContent = err instanceof ImportError ? err.message : `Could not read it: ${(err as Error).message}`;
    }
  };
  $<HTMLTextAreaElement>('imp-text').focus();

  // QR scanning, where the browser offers a barcode detector and a camera
  const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
  if (Detector && navigator.mediaDevices?.getUserMedia) {
    const scan = $('imp-scan');
    scan.style.display = 'inline-block';
    scan.onclick = async () => {
      try {
        const video = $<HTMLVideoElement>('imp-video');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = stream;
        video.style.display = 'block';
        await video.play();
        const detector = new Detector({ formats: ['qr_code'] });
        error.textContent = 'Point the camera at an Entangled QR code.';
        const tick = async () => {
          if (!open) return;
          const found = await detector.detect(video).catch(() => []);
          const link = found.map((f) => f.rawValue).find((v) => v.includes(SHARE_PREFIX));
          if (link) {
            close();
            location.hash = link.slice(link.indexOf(SHARE_PREFIX));
            return;
          }
          requestAnimationFrame(() => void tick());
        };
        void tick();
      } catch (err) {
        error.textContent = `Camera not available: ${(err as Error).message}`;
      }
    };
  }
}
