import { describe, expect, it } from 'vitest';
import { amplitudes, bytesText, deviceFor, maxQubits, racksFor, scaleFor, stateBytes, SUPERCOMPUTER_BYTES } from './scale';

describe('the exponential wall', () => {
  it('counts exactly: 2^n amplitudes of 16 bytes', () => {
    expect(stateBytes(1)).toBe(32);
    expect(stateBytes(20)).toBe(16 * 1048576);
    expect(amplitudes(50)).toBe('1,125,899,906,842,624');
    expect(amplitudes(2)).toBe('4');
  });

  it('says bytes in words', () => {
    expect(bytesText(stateBytes(2))).toBe('64 bytes');
    expect(bytesText(stateBytes(20))).toBe('16 MB');
    expect(bytesText(stateBytes(30))).toBe('16 GB');
    expect(bytesText(stateBytes(50))).toBe('16 PB');
    expect(bytesText(stateBytes(60))).toBe('16 EB');
  });

  it('climbs from phone to laptop to server to rack to supercomputer and beyond', () => {
    expect(deviceFor(10)).toBe('phone');
    expect(deviceFor(28)).toBe('phone');
    expect(deviceFor(29)).toBe('laptop');
    expect(deviceFor(33)).toBe('server');
    expect(deviceFor(43)).toBe('rack');
    expect(deviceFor(46)).toBe('supercomputer');
    expect(deviceFor(49)).toBe('supercomputer');
    expect(deviceFor(50)).toBe('beyond');
    // each qubit doubles the racks
    expect(racksFor(50)).toBe(2 * racksFor(49));
    expect(racksFor(30)).toBe(0);
    expect(maxQubits(SUPERCOMPUTER_BYTES)).toBe(49);
  });

  it('writes a sentence for every size', () => {
    expect(scaleFor(2).note).toMatch(/Any computer/);
    expect(scaleFor(50).note).toMatch(/More memory than any supercomputer/);
    expect(scaleFor(45).note).toMatch(/supercomputer: \d/);
  });
});
