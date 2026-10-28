/**
 * The exponential wall: what an ordinary computer needs just to write down
 * the state of n qubits. Every basis state has a complex amplitude, two
 * 64-bit numbers (16 bytes), and there are 2^n of them. Each qubit doubles
 * it: a phone holds 28 qubits, a laptop 32, a server rack about 43, and at
 * around 49 the memory of the largest supercomputers runs out.
 */

export type Device = 'phone' | 'laptop' | 'server' | 'rack' | 'supercomputer' | 'beyond';

/** Memory of one rack of servers, bytes (about 140 TB). */
export const RACK_BYTES = 2 ** 47;
/** Memory of the largest supercomputers, bytes (about 10 PB). */
export const SUPERCOMPUTER_BYTES = 10e15;

const DEVICES: { device: Device; upTo: number }[] = [
  { device: 'phone', upTo: 2 ** 32 }, // 4 GB
  { device: 'laptop', upTo: 2 ** 36 }, // 64 GB
  { device: 'server', upTo: 2 ** 41 }, // 2 TB
  { device: 'rack', upTo: RACK_BYTES },
  { device: 'supercomputer', upTo: SUPERCOMPUTER_BYTES },
];

/** Bytes for the exact state of n qubits (2^n amplitudes of 16 bytes). */
export function stateBytes(n: number): number {
  return 16 * 2 ** n;
}

/** 2^n written out in full, with separators: 2^50 = 1,125,899,906,842,624. */
export function amplitudes(n: number): string {
  return (2n ** BigInt(n)).toLocaleString('en-US');
}

/** Bytes in words, in powers of 1024: 16 MB, 16 PB. */
export function bytesText(b: number): string {
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  let i = 0;
  while (b >= 1024 && i < units.length - 1) {
    b /= 1024;
    i++;
  }
  return `${b >= 100 || Number.isInteger(b) ? Math.round(b) : b.toFixed(1)} ${units[i]}`;
}

export function deviceFor(n: number): Device {
  const b = stateBytes(n);
  return DEVICES.find((d) => b <= d.upTo)?.device ?? 'beyond';
}

/** Racks of memory the state fills (0 below a rack). */
export function racksFor(n: number): number {
  const b = stateBytes(n);
  return b <= 2 ** 41 ? 0 : Math.ceil(b / RACK_BYTES);
}

/** The largest number of qubits a device of this kind can hold. */
export function maxQubits(bytes: number): number {
  return Math.floor(Math.log2(bytes / 16));
}

export interface Scale {
  n: number;
  amplitudes: string;
  bytes: string;
  device: Device;
  racks: number;
  /** One sentence for the card. */
  note: string;
}

export function scaleFor(n: number): Scale {
  const device = deviceFor(n);
  const racks = racksFor(n);
  const notes: Record<Device, string> = {
    phone: n <= 10 ? 'A handful of numbers. Any computer could write this down.' : 'A phone could hold this state.',
    laptop: "This state needs a laptop's memory.",
    server: 'This state needs a server full of memory.',
    rack: `This state fills ${racks === 1 ? 'a rack' : `${racks} racks`} of servers.`,
    supercomputer: `This state needs a supercomputer: ${racks.toLocaleString('en-US')} racks of memory.`,
    beyond: `More memory than any supercomputer has: ${racks.toLocaleString('en-US')} racks. A quantum chip holds it in ${n} qubits.`,
  };
  return { n, amplitudes: amplitudes(n), bytes: bytesText(stateBytes(n)), device, racks, note: notes[device] };
}
