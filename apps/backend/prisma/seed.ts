import { PrismaClient, Site } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

// Jeu de données de démo réaliste : ~6 semaines d'historique (4 passées +
// aujourd'hui + 2 à venir) sur 2 sites, pour que l'app donne l'impression
// d'être utilisée depuis un moment (plannings passés, pointages, quelques
// employés en poste "en ce moment", échanges de shifts à différents stades).
//
// Idempotent pour la partie référentiel (company/sites/devices/users —
// upsert par clé unique), mais les données transactionnelles (shifts,
// assignations, offres, pointages, disponibilités) sont supprimées puis
// régénérées à chaque exécution : relancer ce script donne un instantané
// cohérent plutôt que d'accumuler des doublons.

const PASSWORD = 'password123';

const SITE_DEFS = [
  { name: 'Site Bruxelles Centre', address: 'Rue de la Loi 1, 1000 Bruxelles' },
  { name: 'Site Ixelles', address: 'Chaussée d’Ixelles 200, 1050 Ixelles' },
];

const EMPLOYEE_DEFS = [
  { email: 'employee@test.local', firstName: 'Eric', lastName: 'Employé' },
  { email: 'thomas.lefevre@test.local', firstName: 'Thomas', lastName: 'Lefèvre' },
  { email: 'sophie.vandamme@test.local', firstName: 'Sophie', lastName: 'Van Damme' },
  { email: 'karim.benali@test.local', firstName: 'Karim', lastName: 'Benali' },
  { email: 'julie.meunier@test.local', firstName: 'Julie', lastName: 'Meunier' },
  { email: 'nabil.amrani@test.local', firstName: 'Nabil', lastName: 'Amrani' },
  { email: 'amelie.dubois@test.local', firstName: 'Amélie', lastName: 'Dubois' },
  { email: 'lucas.petit@test.local', firstName: 'Lucas', lastName: 'Petit' },
  // Prénoms relevés depuis le planning existant de The Barn Etterbeek
  // (capture fournie par l'utilisateur) — pas de nom de famille connu, donc
  // lastName vide ; à rattacher au site manuellement ensuite (page Équipe).
  { email: 'jephan@test.local', firstName: 'Jephan', lastName: '' },
  { email: 'manon@test.local', firstName: 'Manon', lastName: '' },
  { email: 'arthur@test.local', firstName: 'Arthur', lastName: '' },
  { email: 'charlotte@test.local', firstName: 'Charlotte', lastName: '' },
  { email: 'harold@test.local', firstName: 'Harold', lastName: '' },
  { email: 'aurelie@test.local', firstName: 'Aurélie', lastName: '' },
  { email: 'marie.d@test.local', firstName: 'Marie D', lastName: '' },
  { email: 'harry@test.local', firstName: 'Harry', lastName: '' },
  { email: 'pierre@test.local', firstName: 'Pierre', lastName: '' },
  { email: 'adrian@test.local', firstName: 'Adrian', lastName: '' },
  { email: 'louis@test.local', firstName: 'Louis', lastName: '' },
  { email: 'baptiste@test.local', firstName: 'Baptiste', lastName: '' },
  { email: 'eva@test.local', firstName: 'Eva', lastName: '' },
  { email: 'victoria@test.local', firstName: 'Victoria', lastName: '' },
  { email: 'barbara@test.local', firstName: 'Barbara', lastName: '' },
  { email: 'judith@test.local', firstName: 'Judith', lastName: '' },
  { email: 'madeline@test.local', firstName: 'Madeline', lastName: '' },
  { email: 'dustin@test.local', firstName: 'Dustin', lastName: '' },
  { email: 'jolien@test.local', firstName: 'Jolien', lastName: '' },
  { email: 'etty@test.local', firstName: 'Etty', lastName: '' },
  { email: 'martin@test.local', firstName: 'Martin', lastName: '' },
  { email: 'eve@test.local', firstName: 'Eve', lastName: '' },
  { email: 'capucine@test.local', firstName: 'Capucine', lastName: '' },
  { email: 'maud@test.local', firstName: 'Maud', lastName: '' },
  { email: 'emilie@test.local', firstName: 'Emilie', lastName: '' },
];

const SHIFT_TEMPLATES = [
  { startH: 8, startM: 0, endH: 16, endM: 0 },
  { startH: 12, startM: 0, endH: 20, endM: 0 },
  { startH: 14, startM: 0, endH: 22, endM: 0 },
];

const EDIT_REASONS = ['Oubli de pointage', 'Départ anticipé validé', 'Correction horaire'];

// ---------- Petits utilitaires date/hasard ----------

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function addMinutes(d: Date, n: number) {
  return new Date(d.getTime() + n * 60_000);
}
function atTime(d: Date, h: number, m: number) {
  const r = new Date(d);
  r.setHours(h, m, 0, 0);
  return r;
}
function startOfWeek(d: Date) {
  const r = new Date(d);
  const day = (r.getDay() + 6) % 7; // lundi = 0
  r.setDate(r.getDate() - day);
  r.setHours(0, 0, 0, 0);
  return r;
}
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}
function weightedPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}
function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function main() {
  // ---------- Référentiel (idempotent) ----------

  let company = await prisma.company.findFirst({ where: { name: 'Horaires Demo' } });
  if (!company) {
    company = await prisma.company.create({ data: { name: 'Horaires Demo' } });
  }

  const sites: Site[] = [];
  for (const def of SITE_DEFS) {
    let site = await prisma.site.findFirst({ where: { companyId: company.id, name: def.name } });
    if (!site) {
      site = await prisma.site.create({ data: { companyId: company.id, name: def.name, address: def.address } });
    }
    sites.push(site);
  }

  const deviceBySiteId = new Map<string, string>();
  for (const site of sites) {
    let device = await prisma.siteDevice.findFirst({ where: { siteId: site.id } });
    if (!device) {
      device = await prisma.siteDevice.create({
        data: { siteId: site.id, deviceLabel: `Tablette — ${site.name}`, qrSecret: randomBytes(24).toString('hex') },
      });
    }
    deviceBySiteId.set(site.id, device.id);
  }

  const passwordHash = await bcrypt.hash(PASSWORD, SALT_ROUNDS);

  const manager = await prisma.user.upsert({
    where: { email: 'manager@test.local' },
    update: {},
    create: {
      companyId: company.id,
      email: 'manager@test.local',
      passwordHash,
      firstName: 'Marie',
      lastName: 'Manager',
      role: 'manager',
      status: 'active',
    },
  });

  const employees: { id: string; firstName: string; lastName: string; email: string; pin: string }[] = [];
  for (let i = 0; i < EMPLOYEE_DEFS.length; i++) {
    const def = EMPLOYEE_DEFS[i];
    const pin = String(1001 + i);
    const pinCodeHash = await bcrypt.hash(pin, SALT_ROUNDS);
    const badgeCode = `BADGE-DEMO-${String(i + 1).padStart(3, '0')}`;
    // Répartis entre les deux sites en alternance, sauf un sur trois laissé
    // non-assigné (siteId: null) — pour que la démo montre à la fois le cas
    // normal ET le cas "pas encore rattaché" (visible sur tous les sites,
    // voir UsersService.findAll et décision #25) sans configuration
    // manuelle. `update: {}` sur l'upsert : un employé déjà en base garde
    // le site qui lui a été assigné manuellement, jamais réécrasé au reseed.
    const siteId = i % 3 === 2 ? undefined : sites[i % 2].id;
    const user = await prisma.user.upsert({
      where: { email: def.email },
      update: {},
      create: {
        companyId: company.id,
        email: def.email,
        passwordHash,
        firstName: def.firstName,
        lastName: def.lastName,
        role: 'employee',
        status: 'active',
        pinCodeHash,
        badgeCode,
        siteId,
      },
    });
    employees.push({ id: user.id, firstName: def.firstName, lastName: def.lastName, email: def.email, pin });
  }

  // ---------- Nettoyage des données transactionnelles ----------
  // Pour que relancer le script donne un instantané cohérent au lieu
  // d'accumuler des doublons à chaque exécution.

  const siteIds = sites.map((s) => s.id);
  const employeeIds = employees.map((e) => e.id);

  await prisma.timeEntry.deleteMany({ where: { siteId: { in: siteIds } } });
  const oldShifts = await prisma.shift.findMany({ where: { siteId: { in: siteIds } }, select: { id: true } });
  const oldShiftIds = oldShifts.map((s) => s.id);
  const oldAssignments = await prisma.shiftAssignment.findMany({
    where: { shiftId: { in: oldShiftIds } },
    select: { id: true },
  });
  const oldAssignmentIds = oldAssignments.map((a) => a.id);
  const oldOffers = await prisma.shiftOffer.findMany({
    where: { shiftAssignmentId: { in: oldAssignmentIds } },
    select: { id: true },
  });
  // Doit précéder la suppression des ShiftOffer eux-mêmes (contrainte FK) —
  // manquant avant l'ajout du modèle multi-candidats (décision #22), ce qui
  // faisait planter tout reseed d'une base ayant déjà des candidatures.
  await prisma.shiftOfferCandidate.deleteMany({ where: { offerId: { in: oldOffers.map((o) => o.id) } } });
  await prisma.shiftOffer.deleteMany({ where: { shiftAssignmentId: { in: oldAssignmentIds } } });
  await prisma.shiftAssignment.deleteMany({ where: { shiftId: { in: oldShiftIds } } });
  await prisma.shift.deleteMany({ where: { id: { in: oldShiftIds } } });
  await prisma.availability.deleteMany({ where: { userId: { in: employeeIds } } });

  // ---------- Génération du planning : 4 semaines passées + 2 à venir ----------

  const today = atTime(new Date(), 0, 0);
  const monday = startOfWeek(today);
  const rangeStart = addDays(monday, -28);
  const rangeEnd = addDays(monday, 13); // fin de la semaine prochaine

  const busyByDay = new Map<string, Set<string>>();
  const futureOpenAssignments: { assignmentId: string; employeeId: string; startsAt: Date; endsAt: Date }[] = [];
  // Reflète les créneaux réellement occupés par chaque employé (hors shifts
  // annulés) — utilisé plus bas pour ne jamais proposer, en démo, un
  // "collègue" déjà pris sur le créneau de l'échange (sinon la validation
  // manager échoue systématiquement avec un vrai conflit d'horaire).
  const assignmentsByEmployee = new Map<string, { startsAt: Date; endsAt: Date }[]>();
  function hasOverlap(employeeId: string, startsAt: Date, endsAt: Date) {
    const slots = assignmentsByEmployee.get(employeeId) ?? [];
    return slots.some((s) => s.startsAt < endsAt && s.endsAt > startsAt);
  }

  let shiftCount = 0;
  let entryCount = 0;

  for (let d = new Date(rangeStart); d <= rangeEnd; d = addDays(d, 1)) {
    const dateKey = d.toISOString().slice(0, 10);
    const isPast = d < today;
    const isFuture = d > today;

    for (const site of sites) {
      // Pas de shift sur ce site ce jour-là dans ~18% des cas — un planning
      // réel n'est jamais rempli à 100%.
      if (Math.random() > 0.82) continue;

      const template = pick(SHIFT_TEMPLATES);
      const startsAt = atTime(d, template.startH, template.startM);
      const endsAt = atTime(d, template.endH, template.endM);

      let daySet = busyByDay.get(dateKey);
      if (!daySet) {
        daySet = new Set();
        busyByDay.set(dateKey, daySet);
      }
      const available = employees.filter((e) => !daySet!.has(e.id));
      if (available.length === 0) continue;
      const employee = pick(available);
      daySet.add(employee.id);

      const shift = await prisma.shift.create({
        data: { siteId: site.id, startsAt, endsAt, status: 'published', createdBy: manager.id },
      });
      shiftCount++;

      // Un shift passé annulé de temps en temps — pas de pointage associé.
      const cancelled = isPast && Math.random() < 0.05;
      const assignmentStatus = cancelled ? 'cancelled' : isPast ? 'confirmed' : 'assigned';

      const assignment = await prisma.shiftAssignment.create({
        data: { shiftId: shift.id, userId: employee.id, status: assignmentStatus },
      });

      if (assignmentStatus !== 'cancelled') {
        const slots = assignmentsByEmployee.get(employee.id) ?? [];
        slots.push({ startsAt, endsAt });
        assignmentsByEmployee.set(employee.id, slots);
      }

      if (isFuture && assignmentStatus === 'assigned') {
        futureOpenAssignments.push({ assignmentId: assignment.id, employeeId: employee.id, startsAt, endsAt });
      }

      if (isPast && assignmentStatus === 'confirmed') {
        entryCount += await seedTimeEntriesForShift(
          employee.id,
          site.id,
          startsAt,
          endsAt,
          deviceBySiteId.get(site.id),
          manager.id,
        );
      }
    }
  }

  // ---------- Cycle de vie des échanges de shifts, sur des créneaux à venir ----------
  // Pour que Marché de shifts / Validations aient toujours quelque chose à
  // montrer, indépendamment de l'aléatoire ci-dessus.

  const pool = shuffled(futureOpenAssignments);
  let offerCount = 0;

  // Deux offres ouvertes (visibles par les collègues dans "Offres disponibles").
  for (const target of pool.splice(0, 2)) {
    await prisma.shiftAssignment.update({ where: { id: target.assignmentId }, data: { status: 'offered' } });
    await prisma.shiftOffer.create({
      data: {
        shiftAssignmentId: target.assignmentId,
        offeredBy: target.employeeId,
        status: 'open',
        requiresManagerApproval: true,
      },
    });
    offerCount++;
  }

  // Deux offres avec des candidatures en attente de validation manager —
  // l'une avec un seul candidat, l'autre avec deux pour illustrer le choix
  // dans le menu déroulant de la page Approvals. Le shift reste 'offered'
  // (ni l'offre ni l'assignation ne changent tant que le manager n'a pas
  // choisi, voir décision correspondante dans CLAUDE.md) ; les candidats
  // sont choisis parmi les employés qui n'ont pas déjà un shift sur ce
  // créneau, sinon la validation manager échouerait systématiquement avec
  // un vrai conflit d'horaire (409).
  const candidateCountByOffer = [1, 2];
  for (const [index, target] of pool.splice(0, 2).entries()) {
    const available = shuffled(
      employees.filter((e) => e.id !== target.employeeId && !hasOverlap(e.id, target.startsAt, target.endsAt)),
    );
    const fallback = employees.filter((e) => e.id !== target.employeeId);
    const chosenCandidates = (available.length > 0 ? available : fallback).slice(0, candidateCountByOffer[index] ?? 1);

    await prisma.shiftAssignment.update({ where: { id: target.assignmentId }, data: { status: 'offered' } });
    const offer = await prisma.shiftOffer.create({
      data: {
        shiftAssignmentId: target.assignmentId,
        offeredBy: target.employeeId,
        status: 'open',
        requiresManagerApproval: true,
      },
    });
    for (const candidate of chosenCandidates) {
      await prisma.shiftOfferCandidate.create({ data: { offerId: offer.id, userId: candidate.id } });
    }
    offerCount++;
  }

  // ---------- Présence en direct ----------
  // Quelques employés "en poste" au moment où le script tourne, pour que
  // Présence en direct ait tout de suite des données peu importe l'heure.

  const now = new Date();
  const liveSite = sites[0];
  const liveEmployees = shuffled(employees).slice(0, 3);
  for (const emp of liveEmployees) {
    await prisma.timeEntry.create({
      data: {
        userId: emp.id,
        siteId: liveSite.id,
        deviceId: deviceBySiteId.get(liveSite.id),
        type: 'clock_in',
        timestamp: addMinutes(now, -randInt(30, 240)),
        source: 'qr_scan_own_phone',
      },
    });
    entryCount++;
  }

  // ---------- Disponibilités ----------
  // Récurrentes, pour les 5 premiers employés du pool.

  let availabilityCount = 0;
  for (const emp of employees.slice(0, 5)) {
    for (let day = 0; day <= 5; day++) {
      const isAvailable = Math.random() > 0.2;
      // "Disponible" = toujours toute la journée — voir AvailabilitiesScreen
      // (checkin-mobile) : l'écran n'envoie plus jamais d'heures restreintes
      // pour isAvailable:true (décision #8), donc une ligne avec des heures
      // précises ici ne correspondrait plus à rien que l'app puisse afficher
      // ou éditer : un employé la verrait comme "Disponible" sans limite,
      // pendant que le backend continuerait à bloquer silencieusement en
      // dehors de ces heures (bug remonté en prod sur Nabil Amrani/Eric
      // Employé — cases visuellement libres qui refusaient toute dépose hors
      // d'une fenêtre invisible). "Indisponible" garde de la variété (journée
      // entière ou plage à un seul bord) pour continuer à exercer l'affichage
      // partiel de la grille planning (décision #14).
      let startTime = '00:00';
      let endTime = '23:59';
      if (!isAvailable) {
        const shape = pick(['full', 'from', 'until'] as const);
        if (shape === 'from') startTime = pick(['12:00', '17:00', '18:00']);
        if (shape === 'until') endTime = pick(['09:00', '12:00', '14:00']);
      }
      await prisma.availability.create({
        data: {
          userId: emp.id,
          dayOfWeek: day,
          startTime,
          endTime,
          isAvailable,
        },
      });
      availabilityCount++;
    }
  }

  console.log('Seed terminé.');
  console.log(`  Entreprise    : ${company.name} (${company.id})`);
  console.log(`  Sites         : ${sites.map((s) => s.name).join(', ')}`);
  console.log(`  Shifts        : ${shiftCount} (4 semaines passées + 2 à venir)`);
  console.log(`  Pointages     : ${entryCount}`);
  console.log(`  Échanges      : ${offerCount} (offres ouvertes + en attente de validation manager)`);
  console.log(`  Disponibilités: ${availabilityCount}`);
  console.log('');
  console.log(`  Manager  : manager@test.local / ${PASSWORD}`);
  console.log(`  Employé  : employee@test.local / ${PASSWORD} (PIN 1001, badge BADGE-DEMO-001)`);
  console.log('  Autres employés (même mot de passe) :');
  for (const e of employees.slice(1)) {
    console.log(`    ${e.email} — PIN ${e.pin}`);
  }
}

// Génère les pointages d'un shift passé confirmé : arrivée/départ avec un
// léger décalage réaliste, une pause pour les shifts longs, et de temps en
// temps une correction manager pour donner l'impression d'un historique
// vécu plutôt que de données parfaites.
async function seedTimeEntriesForShift(
  userId: string,
  siteId: string,
  startsAt: Date,
  endsAt: Date,
  deviceId: string | undefined,
  managerId: string,
): Promise<number> {
  const source = weightedPick(
    ['qr_scan_own_phone', 'badge_scan', 'pin_code', 'gps'] as const,
    [0.4, 0.35, 0.15, 0.1],
  );
  const usesDevice = source === 'badge_scan' || source === 'pin_code';
  let count = 0;

  const clockIn = addMinutes(startsAt, randInt(-6, 4));
  await prisma.timeEntry.create({
    data: {
      userId,
      siteId,
      deviceId: usesDevice ? deviceId : undefined,
      type: 'clock_in',
      timestamp: clockIn,
      source,
    },
  });
  count++;

  const durationHours = (endsAt.getTime() - startsAt.getTime()) / 3_600_000;
  if (durationHours >= 5 && Math.random() < 0.55) {
    const mid = new Date((startsAt.getTime() + endsAt.getTime()) / 2);
    const breakStart = addMinutes(mid, randInt(-20, 20));
    const breakEnd = addMinutes(breakStart, 30);
    await prisma.timeEntry.create({
      data: { userId, siteId, deviceId: usesDevice ? deviceId : undefined, type: 'break_start', timestamp: breakStart, source },
    });
    await prisma.timeEntry.create({
      data: { userId, siteId, deviceId: usesDevice ? deviceId : undefined, type: 'break_end', timestamp: breakEnd, source },
    });
    count += 2;
  }

  const isEdited = Math.random() < 0.05;
  await prisma.timeEntry.create({
    data: {
      userId,
      siteId,
      deviceId: usesDevice ? deviceId : undefined,
      type: 'clock_out',
      timestamp: addMinutes(endsAt, randInt(-3, 9)),
      source,
      ...(isEdited
        ? { isEdited: true, editedBy: managerId, editReason: pick(EDIT_REASONS) }
        : {}),
    },
  });
  count++;

  return count;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
