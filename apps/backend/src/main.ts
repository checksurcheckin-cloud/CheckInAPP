import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

// Railway ignore railway.json (Config as Code abandonné pour ce service) et
// donc son Pre-deploy : une migration n'y a jamais été appliquée et toute
// lecture de `users` plantait en 500. Les migrations passent donc ici, au
// démarrage, avant d'ouvrir le serveur — sur Railway uniquement (variables
// posées par la plateforme), jamais en local où `prisma migrate dev` reste
// la règle. Un échec arrête le démarrage plutôt que de servir un schéma
// incomplet.
function applyMigrationsOnRailway() {
  const onRailway = Boolean(
    process.env.RAILWAY_ENVIRONMENT_ID ?? process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.RAILWAY_ENVIRONMENT,
  );
  if (!onRailway) return;
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: join(__dirname, '..'), // apps/backend, où se trouve prisma/schema.prisma
    stdio: 'inherit',
  });
}

async function bootstrap() {
  applyMigrationsOnRailway();
  const app = await NestFactory.create(AppModule);

  // Valide automatiquement les DTOs sur toutes les routes
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  app.enableCors(); // à restreindre aux domaines connus une fois en prod

  // Doc API auto-générée, servie sur /api-docs — c'est le contrat partagé avec le mobile
  const config = new DocumentBuilder()
    .setTitle('Horaires API')
    .setDescription('API de gestion des horaires, pointage et shifts')
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
