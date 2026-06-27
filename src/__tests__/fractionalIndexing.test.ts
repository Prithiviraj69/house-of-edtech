import { describe, it, expect } from 'vitest';
import { getMidpoint, generateInitialOrderKeys } from '../lib/fractionalIndexing';

describe('Fractional Indexing (getMidpoint)', () => {
  it('should generate n as the midpoint for empty boundaries', () => {
    expect(getMidpoint('', '')).toBe('n');
  });

  it('should generate a key before next if prev is empty', () => {
    const next = 'n';
    const mid = getMidpoint('', next);
    expect(mid.localeCompare(next)).toBeLessThan(0);
    expect(mid.localeCompare('')).toBeGreaterThan(0);
  });

  it('should generate a key after prev if next is empty', () => {
    const prev = 'n';
    const mid = getMidpoint(prev, '');
    expect(mid.localeCompare(prev)).toBeGreaterThan(0);
  });

  it('should generate a key between prev and next when there is character space', () => {
    const prev = 'g';
    const next = 'n';
    const mid = getMidpoint(prev, next);
    
    expect(mid.localeCompare(prev)).toBeGreaterThan(0);
    expect(mid.localeCompare(next)).toBeLessThan(0);
  });

  it('should go deeper and append midpoints if there is no character space', () => {
    const prev = 'a';
    const next = 'b';
    const mid = getMidpoint(prev, next);
    
    // Should be something like 'an'
    expect(mid.localeCompare(prev)).toBeGreaterThan(0);
    expect(mid.localeCompare(next)).toBeLessThan(0);
    expect(mid.startsWith('a')).toBe(true);
  });

  it('should generate a list of ordered keys sequentially', () => {
    const count = 10;
    const keys = generateInitialOrderKeys(count);
    
    expect(keys).toHaveLength(count);
    for (let i = 0; i < count - 1; i++) {
      expect(keys[i]!.localeCompare(keys[i + 1]!)).toBeLessThan(0);
    }
  });
});
