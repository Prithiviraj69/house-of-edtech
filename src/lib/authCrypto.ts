import crypto from 'crypto';

export async function hashPassword(password: string): Promise<string> {
  // Use Node's built-in crypto module on server-side
  return crypto.createHash('sha256').update(password).digest('hex');
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const userHash = await hashPassword(password);
  return userHash === hash;
}
