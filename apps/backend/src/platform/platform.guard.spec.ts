import { Controller, Get, INestApplication, Module, UseGuards, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtStrategy } from '../auth/jwt.strategy';
import { PlatformModule } from './platform.module';
import { PLATFORM_AUDIENCE } from './platform-jwt';

// Secrets de test, posés avant la création des stratégies (lus à leur
// construction).
const COMPANY_SECRET = 'test-company-secret';
const PLATFORM_SECRET = 'test-platform-secret';
process.env.JWT_ACCESS_SECRET = COMPANY_SECRET;
process.env.JWT_DEVICE_SECRET = 'test-device-secret';
process.env.JWT_PLATFORM_SECRET = PLATFORM_SECRET;

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const SITE_ID = '22222222-2222-4222-8222-222222222222';
const PASSWORD = 'MotDePasseTest12+';

// Champs secrets glissés partout dans les fausses données : si une réponse de
// /platform/* renvoyait un objet Prisma tel quel, ils apparaîtraient.
const LEAKY = {
  qrSecret: 'LEAK-qr-secret',
  passwordHash: 'LEAK-password-hash',
  pinCodeHash: 'LEAK-pin-hash',
  pinCodeEncrypted: 'LEAK-pin-encrypted',
  badgeCode: 'LEAK-badge',
};
const FORBIDDEN = ['qrSecret', 'passwordHash', 'pinCodeHash', 'pinCodeEncrypted', 'badgeCode', 'LEAK-'];

// Route d'entreprise témoin, protégée comme GET /companies/me (JwtAuthGuard).
@Controller('companies')
class CompanyRouteForTest {
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me() {
    return { ok: true };
  }
}

describe('Console plateforme — sécurité (PlatformAuthGuard)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const jwt = new JwtService();
  const admins: Record<string, { id: string; email: string; name: string; role: string; active: boolean; passwordHash: string }> = {};

  const subscription = {
    plan: 'pro',
    status: 'active',
    seats: 20,
    trialEndsAt: null,
    currentPeriodEnd: null,
    notes: null,
    updatedAt: new Date(),
    ...LEAKY,
  };

  const prisma = {
    platformAdmin: {
      findUnique: jest.fn(({ where }: { where: { id?: string; email?: string } }) =>
        Promise.resolve(Object.values(admins).find((a) => a.id === where.id || a.email === where.email) ?? null),
      ),
      update: jest.fn().mockResolvedValue({}),
    },
    company: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([
        {
          id: COMPANY_ID,
          name: 'Horaires Demo',
          createdAt: new Date(),
          jointCommittee: '302',
          subscription,
          _count: { sites: 1, users: 2 },
          sites: [{ id: SITE_ID, _count: { devices: 1 }, ...LEAKY }],
          ...LEAKY,
        },
      ]),
      findUnique: jest.fn().mockResolvedValue({
        id: COMPANY_ID,
        name: 'Horaires Demo',
        createdAt: new Date(),
        jointCommittee: '302',
        planningMode: 'free',
        gpsClockInEnabled: true,
        mobileClockInEnabled: true,
        subscription,
        sites: [
          {
            id: SITE_ID,
            name: 'Site Bruxelles Centre',
            address: 'Rue de la Loi 1',
            timezone: 'Europe/Brussels',
            devices: [{ id: 'device-1', deviceLabel: 'Caisse', lastSeenAt: new Date(), qrRotatedAt: new Date(), ...LEAKY }],
            ...LEAKY,
          },
        ],
        users: [{ id: 'user-1', firstName: 'Ada', lastName: 'Admin', email: 'ada@demo.be', status: 'active', ...LEAKY }],
        ...LEAKY,
      }),
    },
    subscription: {
      groupBy: jest.fn().mockResolvedValue([{ status: 'active', _count: { _all: 1 } }]),
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue(subscription),
    },
    user: {
      count: jest.fn().mockResolvedValue(3),
      groupBy: jest.fn().mockResolvedValue([{ role: 'employee', status: 'active', _count: { _all: 2 } }]),
    },
    site: { count: jest.fn().mockResolvedValue(1) },
    siteDevice: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'device-1',
          deviceLabel: 'Caisse',
          lastSeenAt: new Date(),
          qrRotatedAt: new Date(),
          ...LEAKY,
          site: { id: SITE_ID, name: 'Site Bruxelles Centre', ...LEAKY, company: { id: COMPANY_ID, name: 'Horaires Demo', ...LEAKY } },
        },
      ]),
    },
    timeEntry: {
      count: jest.fn().mockResolvedValue(4),
      groupBy: jest.fn().mockResolvedValue([{ siteId: SITE_ID, _max: { timestamp: new Date() } }]),
      aggregate: jest.fn().mockResolvedValue({ _max: { timestamp: new Date() } }),
    },
    shift: { count: jest.fn().mockResolvedValue(5) },
    platformAuditLog: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'audit-1',
          action: 'subscription.update',
          targetType: 'company',
          targetId: COMPANY_ID,
          payload: { after: { plan: 'pro' } },
          createdAt: new Date(),
          admin: { id: 'admin-owner', name: 'Owner', email: 'owner@checkinapp.local', ...LEAKY },
        },
      ]),
      create: jest.fn().mockResolvedValue({}),
    },
    pushToken: { count: jest.fn().mockResolvedValue(2) },
    notification: { count: jest.fn().mockResolvedValue(7) },
    $queryRaw: jest.fn().mockResolvedValue([{ migration_name: '20261119120000_add_platform_dashboard' }]),
  };

  // PrismaModule est global dans l'app : même chose ici avec la fausse base.
  @Module({})
  class FakePrismaModule {}

  const platformToken = (adminId: string) =>
    jwt.sign({ sub: adminId, typ: 'platform' }, { secret: PLATFORM_SECRET, audience: PLATFORM_AUDIENCE, expiresIn: '1h' });
  const companyToken = () =>
    jwt.sign({ sub: 'user-1', companyId: COMPANY_ID, role: 'admin' }, { secret: COMPANY_SECRET, expiresIn: '1h' });

  const call = (path: string, token?: string, init: RequestInit = {}) =>
    fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    for (const role of ['owner', 'admin', 'readonly']) {
      admins[role] = { id: `admin-${role}`, email: `${role}@checkinapp.local`, name: role, role, active: true, passwordHash };
    }
    admins.disabled = {
      id: 'admin-disabled',
      email: 'disabled@checkinapp.local',
      name: 'disabled',
      role: 'owner',
      active: false,
      passwordHash,
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        {
          module: FakePrismaModule,
          global: true,
          providers: [{ provide: PrismaService, useValue: prisma }],
          exports: [PrismaService],
        },
        PassportModule,
        PlatformModule,
      ],
      controllers: [CompanyRouteForTest],
      providers: [JwtStrategy],
    }).compile();

    app = moduleRef.createNestApplication();
    // Même validation que main.ts.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(0);
    baseUrl = await app.getUrl();
    baseUrl = baseUrl.replace('[::1]', '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('un token d’entreprise n’ouvre pas la console', () => {
    it('401 sur /platform/overview avec un JWT signé par JWT_ACCESS_SECRET', async () => {
      const res = await call('/platform/overview', companyToken());
      expect(res.status).toBe(401);
    });

    it('401 avec un token signé par le bon secret mais sans l’audience plateforme', async () => {
      const forged = jwt.sign({ sub: 'admin-owner', typ: 'platform' }, { secret: PLATFORM_SECRET, expiresIn: '1h' });
      expect((await call('/platform/overview', forged)).status).toBe(401);
    });

    it('401 sans token, et pour un admin plateforme désactivé', async () => {
      expect((await call('/platform/overview')).status).toBe(401);
      expect((await call('/platform/overview', platformToken('admin-disabled'))).status).toBe(401);
    });
  });

  describe('un token plateforme n’ouvre pas les routes d’entreprise', () => {
    it('401 sur GET /companies/me avec un token plateforme (et 200 avec un token d’entreprise)', async () => {
      expect((await call('/companies/me', platformToken('admin-owner'))).status).toBe(401);
      expect((await call('/companies/me', companyToken())).status).toBe(200);
    });
  });

  describe('rôles plateforme', () => {
    const patch = (token: string) =>
      call(`/platform/companies/${COMPANY_ID}/subscription`, token, {
        method: 'PATCH',
        body: JSON.stringify({ plan: 'pro', status: 'active' }),
      });

    it('403 pour un readonly sur PATCH /platform/companies/:id/subscription', async () => {
      prisma.subscription.upsert.mockClear();
      const res = await patch(platformToken('admin-readonly'));
      expect(res.status).toBe(403);
      expect(prisma.subscription.upsert).not.toHaveBeenCalled();
    });

    it('200 pour un admin, et la modification est tracée dans le journal', async () => {
      prisma.platformAuditLog.create.mockClear();
      const res = await patch(platformToken('admin-admin'));
      expect(res.status).toBe(200);
      expect(prisma.platformAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ adminId: 'admin-admin', action: 'subscription.update', targetId: COMPANY_ID }),
        }),
      );
    });

    it('un readonly peut lire', async () => {
      expect((await call('/platform/overview', platformToken('admin-readonly'))).status).toBe(200);
    });
  });

  describe('aucun secret ne sort de /platform/*', () => {
    const readRoutes = [
      '/platform/auth/me',
      '/platform/overview',
      '/platform/companies',
      `/platform/companies/${COMPANY_ID}`,
      '/platform/devices',
      '/platform/health',
      '/platform/audit',
    ];

    it.each(readRoutes)('%s', async (path) => {
      const res = await call(path, platformToken('admin-owner'));
      expect(res.status).toBe(200);
      const body = await res.text();
      for (const forbidden of FORBIDDEN) {
        expect(body).not.toContain(forbidden);
      }
    });

    it('PATCH subscription et login', async () => {
      const patchBody = await (
        await call(`/platform/companies/${COMPANY_ID}/subscription`, platformToken('admin-owner'), {
          method: 'PATCH',
          body: JSON.stringify({ seats: 25 }),
        })
      ).text();
      const loginBody = await (
        await call('/platform/auth/login', undefined, {
          method: 'POST',
          body: JSON.stringify({ email: 'owner@checkinapp.local', password: PASSWORD }),
        })
      ).text();
      for (const forbidden of FORBIDDEN) {
        expect(patchBody).not.toContain(forbidden);
        expect(loginBody).not.toContain(forbidden);
      }
    });
  });

  describe('connexion', () => {
    it('renvoie un token plateforme utilisable, refusé par les routes d’entreprise', async () => {
      const res = await call('/platform/auth/login', undefined, {
        method: 'POST',
        body: JSON.stringify({ email: 'readonly@checkinapp.local', password: PASSWORD }),
      });
      expect(res.status).toBe(200);
      const { accessToken } = (await res.json()) as { accessToken: string };
      expect((await call('/platform/overview', accessToken)).status).toBe(200);
      expect((await call('/companies/me', accessToken)).status).toBe(401);
    });

    it('401 avec un mauvais mot de passe, un email inconnu ou un compte désactivé', async () => {
      for (const body of [
        { email: 'admin@checkinapp.local', password: 'mauvais-mot-de-passe' },
        { email: 'inconnu@checkinapp.local', password: PASSWORD },
        { email: 'disabled@checkinapp.local', password: PASSWORD },
      ]) {
        const res = await call('/platform/auth/login', undefined, { method: 'POST', body: JSON.stringify(body) });
        expect(res.status).toBe(401);
      }
    });
  });
});
