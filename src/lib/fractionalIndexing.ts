/**
 * Fractional indexing algorithm.
 * Generates a string lexicographically between `prev` and `next`.
 * Used for ordering collaborative document blocks.
 */
export function getMidpoint(prev: string = '', next: string = ''): string {
  // Guard against empty strings and normalise
  const p = prev || '';
  const n = next || '';

  if (p === '' && n === '') {
    return 'n';
  }

  if (p === '') {
    // Insert before next. Find first character not equal to 'a'
    let i = 0;
    while (i < n.length && n[i] === 'a') {
      i++;
    }
    if (i === n.length) {
      return 'a'.repeat(n.length) + 'n';
    }
    const charCode = n.charCodeAt(i);
    const midChar = String.fromCharCode(Math.floor((97 + charCode) / 2)); // 'a' is 97
    return n.substring(0, i) + midChar;
  }

  if (n === '') {
    // Insert after prev
    const lastChar = p[p.length - 1];
    if (lastChar === 'z') {
      return p + 'n';
    }
    const nextChar = String.fromCharCode(lastChar.charCodeAt(0) + 1);
    return p.slice(0, -1) + nextChar;
  }

  // Find the first index where prev and next differ
  let commonLen = 0;
  while (commonLen < p.length && commonLen < n.length && p[commonLen] === n[commonLen]) {
    commonLen++;
  }

  const pVal = commonLen < p.length ? p.charCodeAt(commonLen) : 96; // 'a'-1
  const nVal = commonLen < n.length ? n.charCodeAt(commonLen) : 123; // 'z'+1

  if (nVal - pVal > 1) {
    const midVal = Math.floor((pVal + nVal) / 2);
    return p.substring(0, commonLen) + String.fromCharCode(midVal);
  } else {
    // Go deeper into the string to find space
    return p.substring(0, commonLen + 1) + getMidpoint(p.substring(commonLen + 1), n.substring(commonLen + 1));
  }
}

/**
 * Generate initial order keys for an array of elements.
 */
export function generateInitialOrderKeys(count: number): string[] {
  const keys: string[] = [];
  let current = '';
  for (let i = 0; i < count; i++) {
    current = getMidpoint(current, '');
    keys.push(current);
  }
  return keys;
}
