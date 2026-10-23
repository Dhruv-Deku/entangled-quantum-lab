import { describe, expect, it } from 'vitest';
import { CHAPTERS } from './chapters';
import { LESSONS } from './lessons';
import { NOTES, notesFor, speakable } from './notes';

describe('notes', () => {
  it('every chapter and lesson has notes', () => {
    for (const c of [...CHAPTERS, ...LESSONS]) expect(notesFor(c.title), c.title).not.toBeNull();
    expect(notesFor('Circuit diagrams')).not.toBeNull();
    expect(notesFor('No such thing')).toBeNull();
  });

  it('use only characters the panel font can draw, fit the panel, and end with the key idea', () => {
    for (const [title, paras] of Object.entries(NOTES)) {
      expect(paras.length, title).toBeGreaterThanOrEqual(3);
      expect(paras[paras.length - 1], title).toMatch(/^Key idea: /);
      for (const p of paras) {
        expect(/^[\x20-\x7E]+$/.test(p), `${title}: non-ASCII in "${p.slice(0, 40)}..."`).toBe(true);
        expect(p.length, `${title}: paragraph too long`).toBeLessThanOrEqual(320);
      }
    }
  });

  it('read aloud: states and roots become words', () => {
    expect(speakable('(|00> + |11>)/sqrt(2)')).toBe('( zero zero + one one )/root 2');
    expect(speakable('|+> and |->')).toBe('plus and minus');
    expect(speakable('Matrix: [[0, 1], [1, 0]]. In Qiskit: qc.x(0).')).toBe('Matrix: the matrix shown. In Qiskit: the Qiskit call shown.');
  });
});
