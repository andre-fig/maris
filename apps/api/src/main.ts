import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { API_CONFIG, type ApiConfig } from './configuration/api-config.js';

const app = await NestFactory.create(AppModule);
const config = app.get<ApiConfig>(API_CONFIG);

app.enableShutdownHooks();
await app.listen(config.port, config.host);
