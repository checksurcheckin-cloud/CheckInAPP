import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RotatingQrService } from './rotating-qr.service';

describe('RotatingQrService', () => {
  let service: RotatingQrService;
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };

    const module = await Test.createTestingModule({
      providers: [RotatingQrService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(RotatingQrService);
  });

  describe('generateCode', () => {
    it('generates and persists a new secret on first use', async () => {
      prisma.user.findUnique.mockResolvedValue({ qrSecret: null });
      prisma.user.update.mockResolvedValue({});

      const { code, validUntil } = await service.generateCode('user-1');

      expect(code).toMatch(/^\d{6}$/);
      expect(validUntil.getTime()).toBeGreaterThan(Date.now());
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { qrSecret: expect.any(String) },
      });
    });

    it('reuses the existing secret instead of generating a new one', async () => {
      prisma.user.findUnique.mockResolvedValue({ qrSecret: 'EXISTINGSECRET234567' });

      await service.generateCode('user-1');

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.generateCode('ghost')).rejects.toThrow(NotFoundException);
    });
  });

  describe('verifyCode', () => {
    it('accepts the code currently produced from the same secret', async () => {
      prisma.user.findUnique.mockResolvedValue({ qrSecret: null });
      prisma.user.update.mockResolvedValue({});
      const { code } = await service.generateCode('user-1');

      prisma.user.findUnique.mockResolvedValue({ qrSecret: prisma.user.update.mock.calls[0][0].data.qrSecret });

      await expect(service.verifyCode('user-1', code)).resolves.toBe(true);
    });

    it('rejects a wrong code', async () => {
      prisma.user.findUnique.mockResolvedValue({ qrSecret: 'EXISTINGSECRET234567' });

      await expect(service.verifyCode('user-1', '000000')).resolves.toBe(false);
    });

    it('rejects when the user has no secret yet, without throwing', async () => {
      prisma.user.findUnique.mockResolvedValue({ qrSecret: null });

      await expect(service.verifyCode('user-1', '123456')).resolves.toBe(false);
    });
  });

  describe('decodePayload', () => {
    it('parses a well-formed payload', () => {
      expect(service.decodePayload(JSON.stringify({ userId: 'u1', code: '123456' }))).toEqual({
        userId: 'u1',
        code: '123456',
      });
    });

    it('rejects invalid JSON', () => {
      expect(() => service.decodePayload('not-json')).toThrow(BadRequestException);
    });

    it('rejects a payload missing userId/code', () => {
      expect(() => service.decodePayload(JSON.stringify({ foo: 'bar' }))).toThrow(BadRequestException);
    });
  });
});
