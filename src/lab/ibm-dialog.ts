import { IbmClient, loadSettings, saveSettings, type IbmSettings } from './ibm';

/**
 * IBM Quantum settings on the 2D page (a headset browser shows the page before
 * Enter XR): the API key and instance CRN from quantum.cloud.ibm.com, the
 * region, and optionally a backend. Stored only in this browser.
 */

const WRAP = 'position:fixed;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;background:rgba(10,11,13,.55);font:14px/1.45 Inter,system-ui,sans-serif;color:#e4e6eb';
const CARD = 'width:min(520px,92vw);background:#1b1c1f;border:1px solid #34363b;border-radius:20px;padding:20px 22px;display:flex;flex-direction:column;gap:10px';
const INPUT = 'background:#242528;color:#e4e6eb;border:1px solid #34363b;border-radius:12px;padding:10px 12px;font:13px Inter,system-ui,sans-serif';
const BTN = 'height:36px;padding:0 16px;border-radius:18px;border:none;font:600 14px Inter,system-ui,sans-serif;cursor:pointer';

let open = false;

export function openIbmDialog(onSaved?: () => void): void {
  if (open) return;
  open = true;
  const s = loadSettings();
  const wrap = document.createElement('div');
  wrap.style.cssText = WRAP;
  wrap.innerHTML = `<div style="${CARD}">
    <div style="font-weight:700;font-size:20px">Run on IBM Quantum</div>
    <div style="color:#b8bbc1">Use your own IBM Quantum Platform account (the free Open Plan works). On quantum.cloud.ibm.com create an API key, and copy your instance's CRN. Both stay in this browser only.</div>
    <label>API key<input id="ibm-key" type="password" autocomplete="off" style="${INPUT};width:100%" value="${s?.apiKey ?? ''}"></label>
    <label>Instance CRN<input id="ibm-crn" autocomplete="off" placeholder="crn:v1:bluemix:public:quantum-computing:..." style="${INPUT};width:100%" value="${s?.crn ?? ''}"></label>
    <div style="display:flex;gap:10px">
      <label style="flex:1">Region<select id="ibm-region" style="${INPUT};width:100%"><option value="us">US (default)</option><option value="eu-de" ${s?.region === 'eu-de' ? 'selected' : ''}>EU (Frankfurt)</option></select></label>
      <label style="flex:1">Backend (optional)<input id="ibm-backend" placeholder="least busy" style="${INPUT};width:100%" value="${s?.backend ?? ''}"></label>
    </div>
    <div id="ibm-status" style="min-height:20px;color:#b8bbc1"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
      <button id="ibm-forget" style="${BTN};background:#34363b;color:#e4e6eb">Forget</button>
      <button id="ibm-test" style="${BTN};background:#34363b;color:#e4e6eb">Test connection</button>
      <button id="ibm-close" style="${BTN};background:#34363b;color:#e4e6eb">Close</button>
      <button id="ibm-save" style="${BTN};background:#2d7ff9;color:#fff">Save</button>
    </div></div>`;
  document.body.appendChild(wrap);
  const $ = <T extends HTMLElement>(id: string) => wrap.querySelector<T>(`#${id}`)!;
  const status = $('ibm-status');
  const read = (): IbmSettings => ({
    apiKey: $<HTMLInputElement>('ibm-key').value.trim(),
    crn: $<HTMLInputElement>('ibm-crn').value.trim(),
    region: $<HTMLSelectElement>('ibm-region').value === 'eu-de' ? 'eu-de' : 'us',
    backend: $<HTMLInputElement>('ibm-backend').value.trim(),
  });
  const close = () => {
    wrap.remove();
    open = false;
  };
  $('ibm-close').onclick = close;
  $('ibm-forget').onclick = () => {
    saveSettings(null);
    status.textContent = 'Forgotten: the key and CRN were removed from this browser.';
  };
  $('ibm-save').onclick = () => {
    const v = read();
    if (!v.apiKey || !v.crn) {
      status.textContent = 'Both the API key and the CRN are needed.';
      return;
    }
    saveSettings(v);
    onSaved?.();
    close();
  };
  $('ibm-test').onclick = async () => {
    const v = read();
    status.textContent = 'Connecting...';
    try {
      const names = await new IbmClient(v).backends();
      status.textContent = names.length ? `Connected. Backends: ${names.join(', ')}` : 'Connected, but this instance lists no backends.';
    } catch (err) {
      status.textContent = (err as Error).message;
    }
  };
}

/** A small button on the 2D page that opens the dialog. */
export function addIbmButton(): () => void {
  const b = document.createElement('button');
  b.textContent = 'IBM Quantum';
  b.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:10;height:36px;padding:0 16px;border-radius:18px;border:none;background:rgba(28,29,32,.88);color:#e4e6eb;font:600 13px Inter,system-ui,sans-serif;cursor:pointer';
  b.onclick = () => openIbmDialog();
  document.body.appendChild(b);
  return () => b.remove();
}
