import * as readline from 'node:readline';
import { PlatformRole, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

// Crée (ou réinitialise) un admin de la console plateforme — seul moyen d'en
// créer un : la console n'a volontairement pas d'inscription.
//
//   pnpm --filter @horaires/backend create:platform-admin -- <email> "<Nom>" [owner|admin|readonly]
//     -> demande le mot de passe (saisie masquée, deux fois) : recommandé, il
//        ne reste ni dans l'historique du terminal ni dans une conversation.
//   pnpm --filter @horaires/backend create:platform-admin -- <email> "<Nom>" "<MotDePasse>" [owner|admin|readonly]
//
// Rôle par défaut : readonly. Relancé avec un email existant, il remplace le
// nom, le rôle et le mot de passe, et réactive le compte.

const SALT_ROUNDS = 12;
const ROLES = Object.values(PlatformRole);

function fail(message: string): never {
  console.error(`Erreur : ${message}`);
  console.error('Usage : create:platform-admin -- <email> "<Nom>" [owner|admin|readonly]');
  process.exit(1);
}

function isStrong(password: string) {
  return password.length >= 12 && /[a-zA-Z]/.test(password) && /\d/.test(password);
}

// Saisie masquée (une étoile par caractère).
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const output = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let prompted = false;
    output._writeToOutput = (s: string) => {
      if (!prompted) {
        prompted = true;
        output.output.write(s);
      } else if (s === '\r\n' || s === '\n') {
        output.output.write(s);
      } else {
        output.output.write('*'.repeat(s.length));
      }
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

// Base visée, sans identifiants : évite de créer le compte dans une base
// locale en croyant viser Railway (DATABASE_URL du .env du backend).
function databaseLabel() {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    return `${url.hostname}:${url.port}${url.pathname}`;
  } catch {
    return 'DATABASE_URL absente ou invalide';
  }
}

async function main() {
  // pnpm transmet parfois le séparateur « -- » lui-même.
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const [rawEmail, name, ...rest] = args;
  // <email> <Nom> [rôle] -> mot de passe demandé ; sinon <email> <Nom> <MotDePasse> [rôle].
  const askForPassword = rest.length === 0 || (rest.length === 1 && ROLES.includes(rest[0] as PlatformRole));
  const rawRole = (askForPassword ? rest[0] : rest[1]) ?? 'readonly';
  const email = rawEmail?.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('email invalide');
  if (!name?.trim()) fail('nom manquant');
  if (!ROLES.includes(rawRole as PlatformRole)) fail(`rôle invalide (${ROLES.join(', ')})`);
  const role = rawRole as PlatformRole;

  console.log(`Base visée : ${databaseLabel()}`);

  let password = askForPassword ? undefined : rest[0];
  if (!password) {
    if (!process.stdin.isTTY) fail('pas de terminal interactif : passez le mot de passe en argument');
    password = await askHidden('Mot de passe (12 caractères minimum, lettres et chiffres) : ');
    if (!isStrong(password)) fail('mot de passe trop faible (12 caractères minimum, lettres et chiffres)');
    const confirmation = await askHidden('Confirmez le mot de passe : ');
    if (confirmation !== password) fail('les deux mots de passe ne correspondent pas');
  }
  if (!isStrong(password)) fail('mot de passe trop faible (12 caractères minimum, lettres et chiffres)');

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
