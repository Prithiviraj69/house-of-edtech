import { describe, it, expect } from 'vitest';
import { diff3Merge } from '../lib/conflictResolver';

describe('3-Way Text Merge (diff3Merge)', () => {
  it('should return identical content if no changes were made', () => {
    const base = 'The quick brown fox jumps over the lazy dog.';
    const local = 'The quick brown fox jumps over the lazy dog.';
    const remote = 'The quick brown fox jumps over the lazy dog.';
    
    expect(diff3Merge(base, local, remote)).toBe(base);
  });

  it('should accept local changes if remote did not modify the text', () => {
    const base = 'The quick brown fox jumps over the lazy dog.';
    const local = 'The quick energetic brown fox jumps over the lazy dog.';
    const remote = 'The quick brown fox jumps over the lazy dog.';
    
    expect(diff3Merge(base, local, remote)).toBe(local);
  });

  it('should accept remote changes if local did not modify the text', () => {
    const base = 'The quick brown fox jumps over the lazy dog.';
    const local = 'The quick brown fox jumps over the lazy dog.';
    const remote = 'The quick brown fox jumps over the sleeping dog.';
    
    expect(diff3Merge(base, local, remote)).toBe(remote);
  });

  it('should merge non-overlapping concurrent changes from both local and remote', () => {
    const base = 'The quick brown fox jumps over the lazy dog.';
    const local = 'The quick energetic brown fox jumps over the lazy dog.';
    const remote = 'The quick brown fox jumps over the sleeping dog.';
    
    // Both modifications should merge
    const expected = 'The quick energetic brown fox jumps over the sleeping dog.';
    expect(diff3Merge(base, local, remote)).toBe(expected);
  });

  it('should merge concurrent modifications that overlap by combining them deterministically without losing data', () => {
    const base = 'Welcome to the assignment';
    const local = 'Welcome to the Next.js assignment';
    const remote = 'Welcome to the collaborative assignment';

    const result = diff3Merge(base, local, remote);
    
    // Both 'Next.js' and 'collaborative' should exist in the merged result
    expect(result).toContain('Next.js');
    expect(result).toContain('collaborative');
  });
});
