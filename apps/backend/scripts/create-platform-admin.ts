import { PlatformRole, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

// Crée (ou réinitialise) un admin de la console plateforme — seul moyen d'en
// créer un : la console n'a volontairement pas d'inscription.
//
//   pnpm --filter @horaires/backend create:platform-admin -- <email> "<Nom>" "<MotDePasse>" [owner|admin|readonly]
//
// Rôle par défaut : readonly. Relancé avec un email existant, il remplace le
// nom, le rôle et le mot de passe, et réactive le compte.

const SALT_ROUNDS = 12;
const ROLES = Object.values(PlatformRole);

function fail(message: string): never {
  console.error(`Erreur : ${message}`);
  console.error(
    'Usage : create:platform-admin -- <email> "<Nom>" "<MotDePasse>" [owner|admin|readonly]',
  );
  process.exit(1);
}

async function main() {
  // pnpm transmet parfois le séparateur « -- » lui-même.
  const [rawEmail, name, password, rawRole = 'readonly'] = process.argv.slice(2).filter((a) => a !== '--');
  const email = rawEmail?.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('email invalide');
  if (!name?.trim()) fail('nom manquant');
  if (!password || password.length < 12 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    fail('mot de passe trop faible (12 caractères minimum, lettres et chiffres)');
  }
  if (!ROLES.includes(rawRole as PlatformRole)) fail(`rôle invalide (${ROLES.join(', ')})`);
  const role = rawRole as PlatformRole;

  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const admin = await prisma.platformAdmin.upsert({
      where: { email },
      create: { email, name: name.trim(), passwordHash, role },
      update: { name: name.trim(), passwordHash, role, active: true },
      select: { id: true, email: true, name: true, role: true },
    });
    console.log(`Admin plateforme prêt : ${admin.name} <${admin.email}> — rôle ${admin.role}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
