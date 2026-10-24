import type { Msg, Transport } from './room';

/**
 * Ways to reach the people in a room. The WebSocket relay is served by the dev
 * and preview servers at /entangled-relay (or `node server/relay.mjs`, chosen
 * with ?relay=wss://host:port). Without one, tabs on the same device still
 * share through a BroadcastChannel.
 */

const RELAY_PATH = '/entangled-relay';

export function relayUrl(): string {
  const param = new URLSearchParams(location.search).get('relay');
  if (param) {
    try {
      localStorage.setItem('entangled.relay', param);
    } catch {
      // not remembered: the parameter is still used this time
    }
    return param.endsWith(RELAY_PATH) ? param : param.replace(/\/$/, '') + RELAY_PATH;
  }
  try {
    const saved = localStorage.getItem('entangled.relay');
    if (saved) return saved.endsWith(RELAY_PATH) ? saved : saved.replace(/\/$/, '') + RELAY_PATH;
  } catch {
    // fall through to the page's own server
  }
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${RELAY_PATH}`;
}

/** A WebSocket to the relay that reconnects (and rejoins) when the line drops. */
export class WsTransport implements Transport {
  private ws: WebSocket | null = null;
  private onMessage: (m: Msg) => void = () => {};
  private opened: () => void = () => {};
  private closed = false;
  private retries = 0;
  private everOpen = false;

  constructor(
    private readonly url: string,
    /** Called once if the relay cannot be reached at all. */
    private readonly unreachable: () => void,
  ) {}

  listen(onMessage: (m: Msg) => void, opened: () => void): void {
    this.onMessage = onMessage;
    this.opened = opened;
    this.connect();
  }

  private connect(): void {
    if (this.closed) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.unreachable();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.everOpen = true;
      this.retries = 0;
      this.opened();
    };
    ws.onmessage = (e) => {
      try {
        this.onMessage(JSON.parse(String(e.data)) as Msg);
      } catch {
        // not one of ours
      }
    };
    ws.onclose = () => {
      if (this.closed) return;
      if (!this.everOpen) return this.unreachable();
      if (this.retries++ < 8) setTimeout(() => this.connect(), Math.min(8000, 500 * 2 ** this.retries));
    };
  }

  send(msg: Msg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
  }
}

/** Same device, other tabs: plays the relay's part (welcome, leaving, messages to one peer) over a BroadcastChannel. */
export class TabTransport implements Transport {
  private ch: BroadcastChannel | null = null;
  private id = '';
  private last: string | null = null;
  private lastClass: string | null = null;

  constructor(private readonly room: string) {}

  listen(onMessage: (m: Msg) => void, opened: () => void): void {
    this.ch = new BroadcastChannel(`entangled.room.${this.room}`);
    this.ch.onmessage = (e) => {
      const m = e.data as Msg;
      if (m.t === 'sync') this.last = JSON.stringify(m);
      if (m.t === 'class') this.lastClass = JSON.stringify(m);
      if ('to' in m && m.to && m.to !== this.id) return;
      onMessage(m);
    };
    queueMicrotask(() => {
      opened();
      onMessage({ t: 'welcome', room: this.room, peers: [], last: this.last, lastClass: this.lastClass });
    });
    addEventListener('pagehide', () => this.close(), { once: true });
  }

  send(msg: Msg): void {
    if (msg.t === 'join') {
      this.id = msg.from;
      return;
    }
    this.ch?.postMessage(msg);
  }

  close(): void {
    if (!this.ch) return;
    this.ch.postMessage({ t: 'left', from: this.id } satisfies Msg);
    this.ch.close();
    this.ch = null;
  }
}

/** The relay if there is one, otherwise the tabs of this device. Messages sent before the switch are re-sent by the room on reopen. */
export class AutoTransport implements Transport {
  private inner: Transport;
  private handlers: [(m: Msg) => void, () => void] | null = null;

  constructor(room: string, onFallback: () => void) {
    this.inner = new WsTransport(relayUrl(), () => {
      this.inner = new TabTransport(room);
      if (this.handlers) this.inner.listen(...this.handlers);
      onFallback();
    });
  }

  listen(onMessage: (m: Msg) => void, opened: () => void): void {
    this.handlers = [onMessage, opened];
    this.inner.listen(onMessage, opened);
  }

  send(msg: Msg): void {
    this.inner.send(msg);
  }

  close(): void {
    this.inner.close();
  }
}
