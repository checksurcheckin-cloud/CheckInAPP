import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Wrapper standard autour de PrismaClient, injectable partout via PrismaModule.
// Chaque service métier injecte ce service et DOIT filtrer par companyId sur
// toutes les tables qui en ont un (voir CLAUDE.md, règle critique).
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
