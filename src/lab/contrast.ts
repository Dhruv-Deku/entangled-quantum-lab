import { Component } from '@pmndrs/uikit';
import type { Object3D } from '@iwsdk/core';

/**
 * High contrast for every panel: grey text turns white, coloured text gets
 * lighter, dark backgrounds get darker, and grey borders turn bright so every
 * card and button has a clear edge. Applied to what the panels show now, and
 * to every colour the app sets later while it is on; turning it off puts the
 * original colours back.
 */

type Rgb = [number, number, number];
type Role = 'color' | 'backgroundColor' | 'borderColor';
const ROLES: Role[] = ['color', 'backgroundColor', 'borderColor'];

function parseHex(v: unknown): Rgb | null {
  // three.js colours and numbers too
  if (v && typeof v === 'object' && typeof (v as { getHexString?: unknown }).getHexString === 'function') v = '#' + (v as { getHexString: () => string }).getHexString();
  if (typeof v === 'number') v = '#' + v.toString(16).padStart(6, '0');
  if (typeof v !== 'string' || v[0] !== '#') return null;
  const h = v.length === 4 ? v.slice(1).split('').map((c) => c + c).join('') : v.slice(1, 7);
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const hex = ([r, g, b]: Rgb) => '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');

/** Relative luminance (sRGB, 0..1). */
export function luminance([r, g, b]: Rgb): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio between two colours. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(parseHex(a)!), lb = luminance(parseHex(b)!);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const grey = ([r, g, b]: Rgb) => Math.max(r, g, b) - Math.min(r, g, b) < 28;

/** The high-contrast version of a colour in a role (values that are not hex colours pass through). */
export function contrastColor(value: unknown, role: Role): unknown {
  const c = parseHex(value);
  if (!c) return value;
  const l = luminance(c);
  if (role === 'color') {
    if (grey(c)) return l < 0.02 ? value : '#ffffff';
    // coloured text: halfway to white
    return hex([c[0] + (255 - c[0]) * 0.45, c[1] + (255 - c[1]) * 0.45, c[2] + (255 - c[2]) * 0.45]);
  }
  if (role === 'backgroundColor') {
    if (grey(c)) return l > 0.5 ? value : hex([c[0] * 0.4, c[1] * 0.4, c[2] * 0.4]);
    // coloured buttons: a little deeper so white text on them passes 4.5:1
    return hex([c[0] * 0.78, c[1] * 0.78, c[2] * 0.78]);
  }
  return grey(c) ? '#d6d8dc' : value;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = Component<any>;
const originals = new WeakMap<AnyComponent, Partial<Record<Role, unknown>>>();
const touched = new Set<AnyComponent>();
let on = false;
let patched = false;

function remember(c: AnyComponent, role: Role, value: unknown): void {
  let o = originals.get(c);
  if (!o) originals.set(c, (o = {}));
  o[role] = value;
  touched.add(c);
}

/** Wrap setProperties once: while contrast is on, colours are mapped on the way in (and the originals kept). */
function patch(): void {
  if (patched) return;
  patched = true;
  const proto = Component.prototype as unknown as { setProperties: (p: Record<string, unknown>) => void };
  const base = proto.setProperties;
  proto.setProperties = function (this: AnyComponent, props: Record<string, unknown>) {
    if (!on || !props) return base.call(this, props);
    let mapped: Record<string, unknown> | null = null;
    for (const role of ROLES) {
      if (!(role in props)) continue;
      remember(this, role, props[role]);
      mapped ??= { ...props };
      mapped[role] = contrastColor(props[role], role);
    }
    return base.call(this, mapped ?? props);
  };
}

/** Turn high contrast on or off for these panels. */
export function setContrast(panels: readonly (Object3D | null | undefined)[], enable: boolean): void {
  patch();
  if (enable === on) return;
  if (enable) {
    on = true;
    for (const p of panels) {
      p?.traverse((o) => {
        if (!(o instanceof Component)) return;
        const v = (o.properties as unknown as { peek: () => Record<string, unknown> }).peek();
        const next: Record<string, unknown> = {};
        let any = false;
        for (const role of ROLES) {
          const cur = v?.[role];
          if (parseHex(cur) === null) continue;
          if (!originals.get(o)?.[role]) remember(o, role, cur);
          next[role] = contrastColor(originals.get(o)![role], role);
          any = true;
        }
        if (any) {
          // straight through: these are already mapped
          on = false;
          o.setProperties(next);
          on = true;
        }
      });
    }
    return;
  }
  on = false;
  for (const c of touched) {
    const o = originals.get(c);
    if (o) c.setProperties(o as Record<string, unknown>);
  }
  touched.clear();
}

export function contrastOn(): boolean {
  return on;
}
