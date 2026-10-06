import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
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
