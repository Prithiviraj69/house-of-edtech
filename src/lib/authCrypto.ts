// Password hashing using standard Web Crypto API (compatible with Edge and Node.js)

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  
  // Use globalThis.crypto which is standard in React 19 / Node 20+ / Edge environments
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const userHash = await hashPassword(password);
  return userHash === hash;
}
