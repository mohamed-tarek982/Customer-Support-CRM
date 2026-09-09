import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { EnvService } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const env = app.get(EnvService);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: env.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Lets Prisma close its connection pool cleanly on SIGTERM.
  app.enableShutdownHooks();

  await app.listen(env.port);

  logger.log(`API listening on http://localhost:${env.port}/api/v1`);
  logger.log(`CORS origins: ${env.corsOrigins.join(', ')}`);
  logger.log(
    `Object storage: ${env.isStorageConfigured ? 'configured' : 'NOT configured (placeholder credentials)'}`,
  );
}

void bootstrap();
