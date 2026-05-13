import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { GlobalZodValidationPipe } from './common/helper/zod-global-validation-pipe';
import { NestExpressApplication } from '@nestjs/platform-express';
import { cleanupOpenApiDoc } from 'nestjs-zod';

const cors = ['http://localhost:8000', 'http://localhost:8001'];
export function appCreate(app: NestExpressApplication): void {
  app.setGlobalPrefix('api');
  app.set('trust proxy', true);
  app.set('query parser', 'extended');

  app.useGlobalPipes(new GlobalZodValidationPipe());

  /**
   * swagger configuration
   */
  const swaggerConfig = new DocumentBuilder()
    .setTitle('CarFax API')
    .setDescription('Use the base API URL as http://localhost:8003')
    .setTermsOfService('http://localhost:8003/terms-of-service')
    .setLicense(
      'MIT License',
      'https://github.com/git/git-scm.com/blob/main/MIT-LICENSE.txt',
    )
    .addServer('http://localhost:8003')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  // Instantiate Document
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, cleanupOpenApiDoc(document));

  // Enable CORS
  app.enableCors({
    origin: cors,
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
    ],
    exposedHeaders: ['Set-Cookie'],
  });
}