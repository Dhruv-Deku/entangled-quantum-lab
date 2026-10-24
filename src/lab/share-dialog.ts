import qrcode from 'qrcode-generator';
import { parseCode, type Role, type RoomKind } from '../net/room';

/**
 * Shared lab and classroom on the 2D page: your name, then start a shared lab,
 * start a class (as the teacher), or join with a code. While in a room it shows
 * the code, a QR of the link that joins it, and Leave.
 */

const WRAP = 'position:fixed;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;background:rgba(10,11,13,.55);font:14px/1.45 Inter,system-ui,sans-serif;color:#e4e6eb';
const CARD = 'width:min(520px,92vw);background:#1b1c1f;border:1px solid #34363b;border-radius:20px;padding:20px 22px;display:flex;flex-direction:column;gap:10px';
const INPUT = 'background:#242528;color:#e4e6eb;border:1px solid #34363b;border-radius:12px;padding:10px 12px;font:13px Inter,system-ui,sans-serif';
const BTN = 'height:36px;padding:0 16px;border-radius:18px;border:none;font:600 14px Inter,system-ui,sans-serif;cursor:pointer';
const NAME_KEY = 'entangled.name';

export function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // only this session knows the name
  }
}

export interface ShareActions {
  current: { code: string; kind: RoomKind; role: Role; peers: string[]; link: string } | null;
  start(kind: RoomKind, name: string): void;
  join(code: string, name: string, role: Role): void;
  leave(): void;
  /** A certificate is ready to download (null: none yet). */
  certificate: (() => void) | null;
}

let open = false;

export function openShareDialog(a: ShareActions): void {
  if (open) return;
  open = true;
  const wrap = document.createElement('div');
  wrap.style.cssText = WRAP;
  const name = savedName();
  const cur = a.current;
  let body: string;
  if (cur) {
    const qr = qrcode(0, 'M');
    qr.addData(cur.link);
    qr.make();
    body = `
      <div style="font-weight:700;font-size:20px">${cur.kind === 'lab' ? 'Shared lab' : 'Classroom'} ${cur.code}</div>
      <div style="color:#b8bbc1">${cur.kind === 'lab' ? 'Everyone in this room works on one circuit. Select a qubit and press Share in the dock to claim it: then only you can turn it.' : cur.role === 'teacher' ? 'You are the teacher. Assign course modules from the class panel in the headset; each student’s progress shows there.' : 'Your teacher assigns course modules; finish them for your certificate.'}</div>
      <div style="display:flex;gap:16px;align-items:center">
        <img alt="QR code that joins this room" src="${qr.createDataURL(4, 8)}" style="width:150px;height:150px;border-radius:12px;background:#fff">
        <div style="display:flex;flex-direction:column;gap:6px;min-width:0">
          <div>Code: <b style="font-size:18px;letter-spacing:2px">${cur.code}</b></div>
          <div style="color:#b8bbc1;word-break:break-all">${cur.link}</div>
          <div style="color:#b8bbc1">${cur.peers.length ? `Here: ${cur.peers.join(', ')}` : 'Nobody else yet.'}</div>
        </div>
      </div>`;
  } else {
    body = `
      <div style="font-weight:700;font-size:20px">Share</div>
      <div style="color:#b8bbc1">Work on one circuit with someone else, or run a class: you assign modules and watch progress.</div>
      <label>Your name<input id="sh-name" maxlength="16" autocomplete="off" style="${INPUT};width:100%" value="${name.replace(/"/g, '')}"></label>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button id="sh-lab" style="${BTN};background:#2d7ff9;color:#fff">Start a shared lab</button>
        <button id="sh-class" style="${BTN};background:#34363b;color:#e4e6eb">Start a class (teacher)</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input id="sh-code" maxlength="8" placeholder="Code, e.g. LK7QF" autocomplete="off" style="${INPUT};width:150px;text-transform:uppercase">
        <label style="display:flex;gap:6px;align-items:center"><input id="sh-teacher" type="checkbox"> as a teacher</label>
        <button id="sh-join" style="${BTN};background:#34363b;color:#e4e6eb">Join</button>
      </div>`;
  }
  wrap.innerHTML = `<div style="${CARD}">${body}
    <div id="sh-status" style="min-height:20px;color:#b8bbc1"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
      ${a.certificate ? `<button id="sh-cert" style="${BTN};background:#3ddc97;color:#10261c">Download certificate</button>` : ''}
      ${cur ? `<button id="sh-leave" style="${BTN};background:#3a2523;color:#ffb4a8">Leave</button>` : ''}
      <button id="sh-close" style="${BTN};background:#34363b;color:#e4e6eb">Close</button>
    </div></div>`;
  document.body.appendChild(wrap);
  const $ = <T extends HTMLElement>(id: string) => wrap.querySelector<T>(`#${id}`);
  const status = $('sh-status')!;
  const close = () => {
    wrap.remove();
    open = false;
  };
  const who = () => {
    const n = ($<HTMLInputElement>('sh-name')?.value ?? '').trim().slice(0, 16);
    if (!n) status.textContent = 'Type your name first: it is what the others see.';
    else saveName(n);
    return n;
  };
  $('sh-close')!.onclick = close;
  const cert = $('sh-cert');
  if (cert && a.certificate) cert.onclick = a.certificate;
  const leave = $('sh-leave');
  if (leave) leave.onclick = () => (a.leave(), close());
  const lab = $('sh-lab');
  if (lab) lab.onclick = () => (who() ? (a.start('lab', who()), close()) : undefined);
  const cls = $('sh-class');
  if (cls) cls.onclick = () => (who() ? (a.start('class', who()), close()) : undefined);
  const join = $('sh-join');
  if (join)
    join.onclick = () => {
      const n = who();
      if (!n) return;
      const code = parseCode($<HTMLInputElement>('sh-code')!.value);
      if (!code) {
        status.textContent = 'That is not a room code: they look like LK7QF (a lab) or C7QF2 (a class).';
        return;
      }
      a.join(code, n, $<HTMLInputElement>('sh-teacher')!.checked ? 'teacher' : 'student');
      close();
    };
}
