import { createCipheriv, createDecipheriv, randomBytes, randomInt } from 'node:crypto';

// Chiffrement réversible des PIN (AES-256-GCM) — choix produit : le manager
// et l'employé doivent pouvoir relire le PIN à tout moment (page Équipe,
// profil checkin-mobile). La vérification au pointage, elle, passe toujours
// par User.pinCodeHash (bcrypt), jamais par une comparaison en clair.
// Format stocké : "iv.tag.ciphertext", chaque partie en base64.

function key(): Buffer {
  const hex = process.env.PIN_ENCRYPTION_KEY ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('PIN_ENCRYPTION_KEY manquante ou invalide (64 caractères hexadécimaux attendus)');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptPin(pin: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(pin, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString('base64')).join('.');
}

export function decryptPin(stored: string): string {
  const [iv, tag, ciphertext] = stored.split('.').map((part) => Buffer.from(part, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

// 4 chiffres, zéros de tête compris (0000-9999), tiré au hasard
// cryptographique — pas de Math.random pour un code d'accès.
export function randomPin(): string {
  return String(randomInt(0, 10_000)).padStart(4, '0');
}
