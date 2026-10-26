import { describe, expect, it } from 'vitest';
import { formatKelvin } from './machine-kit';

describe('fridge thermometers', () => {
  it('read kelvin above 1 K and millikelvin below', () => {
    expect(formatKelvin(300)).toBe('300 K');
    expect(formatKelvin(50)).toBe('50 K');
    expect(formatKelvin(4)).toBe('4 K');
    expect(formatKelvin(3.6)).toBe('3.6 K');
    expect(formatKelvin(0.8)).toBe('800 mK');
    expect(formatKelvin(0.015)).toBe('15 mK');
  });
});
