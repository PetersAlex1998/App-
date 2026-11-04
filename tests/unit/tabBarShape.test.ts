import { describe, expect, it } from 'vitest';
import { barPath, profile } from '../../src/tabBarShape';

const g = { width: 358, height: 64, depth: 36, halfWidth: 58 };

describe('Tab-Leiste: Form mit Mulde', () => {
  it('ohne Mulde weit weg ist die Oberkante flach, in den Enden rund', () => {
    expect(profile(179, 1000, g).top).toBe(0);
    expect(profile(0, 1000, g)).toMatchObject({ top: 32, bottom: 32 });
    expect(profile(358, 1000, g)).toMatchObject({ top: 32, bottom: 32 });
    expect(profile(179, 1000, g).bottom).toBe(64);
  });
  it('Mulde ist unter dem aktiven Symbol am tiefsten und läuft weich aus', () => {
    const cx = 179;
    expect(profile(cx, cx, g).top).toBe(36);
    expect(profile(cx + 58, cx, g).top).toBe(0);
    expect(profile(cx - 58, cx, g).top).toBe(0);
    expect(profile(cx + 20, cx, g).top).toBeGreaterThan(profile(cx + 40, cx, g).top);
    expect(profile(cx + 20, cx, g).top).toBeCloseTo(profile(cx - 20, cx, g).top, 6);
  });
  it('am Rand ragt die Mulde in die runde Kappe, ohne durch den Boden zu stoßen', () => {
    const cx = 44; // erster Eintrag
    for (let x = 0; x <= g.width; x += 1) {
      const p = profile(x, cx, g);
      expect(p.top).toBeLessThanOrEqual(p.bottom + 1e-9);
      expect(p.top).toBeGreaterThanOrEqual(0);
      expect(p.bottom).toBeLessThanOrEqual(64);
    }
    expect(profile(cx, cx, g).top).toBeGreaterThan(20);
  });
  it('Pfad ist geschlossen und liegt innerhalb der Leiste', () => {
    const d = barPath(100, g);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    const nums = [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(nums.length).toBeGreaterThan(300);
    for (const [x, y] of nums) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(358); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(64); }
  });
});
