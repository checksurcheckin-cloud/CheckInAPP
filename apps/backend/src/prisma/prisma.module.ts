import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// @Global() : pas besoin de réimporter PrismaModule dans chaque module métier
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
