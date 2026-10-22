import { synthHand } from './synthetic';
import type { GestureEvent, HandTracker } from './tracker';

/** Sweep finger curl from `from` to `to` over `seconds`, feeding the tracker; returns events. */
export function synthSequence(t: HandTracker, from: number, to: number, seconds: number, dt: number): GestureEvent[] {
  const steps = Math.max(1, Math.round(seconds / dt));
  const events: GestureEvent[] = [];
  for (let i = 1; i <= steps; i++) {
    const curl = from + ((to - from) * i) / steps;
    events.push(...t.update(synthHand({ curl, spread: (3 * Math.PI) / 180 }), dt));
  }
  return events;
}
