import type { Op } from '../quantum/circuit';

/** Readable name for a single-qubit gate, with its angle when it has one: "H", "Ry 45°". */
export function gateLabel(op: Op & { kind: 'gate' }): string {
  const name = op.gate === 'sdg' ? 'S†' : op.gate === 'tdg' ? 'T†' : op.gate === 'sx' ? '√X' : op.gate === 'sxdg' ? '√X†' : op.gate.length === 1 ? op.gate.toUpperCase() : op.gate[0].toUpperCase() + op.gate.slice(1);
  const a = op.params?.[0];
  if (a === undefined || op.params!.length > 1) return name;
  const deg = Math.round((a * 180) / Math.PI);
  return `${name} ${deg > 0 ? '+' : ''}${deg}°`;
}
