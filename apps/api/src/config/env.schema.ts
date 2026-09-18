import Joi from 'joi';

export const envSchema = Joi.object({
  DATABASE_URL: Joi.string().uri({ scheme: ['postgres', 'postgresql'] }).required(),
  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).required(),
  HOST: Joi.string().default('0.0.0.0'),
  MAX_ARCHIVE_ENTRIES: Joi.number().integer().positive().default(50_000),
  MAX_UNCOMPRESSED_BYTES: Joi.number().integer().positive().default(5_368_709_120),
  MAX_UPLOAD_BYTES: Joi.number().integer().positive().default(268_435_456),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(3001),
  STORAGE_DIR: Joi.string().default('.storage'),
  CHART_STORAGE_DIR: Joi.string().default('.storage/chart-data'),
  CHART_ASSET_BASE_URL: Joi.string().uri().allow('').optional(),
  OPENWEATHER_API_KEY: Joi.string().allow('').default(''),
  WEATHERAPI_API_KEY: Joi.string().allow('').default(''),
  ENC_S3_ENDPOINT: Joi.string().uri().allow('').default(''),
  ENC_S3_REGION: Joi.string().default('auto'),
  ENC_S3_BUCKET: Joi.string().allow('').default(''),
  ENC_S3_ACCESS_KEY_ID: Joi.string().allow('').default(''),
  ENC_S3_SECRET_ACCESS_KEY: Joi.string().allow('').default(''),
}).unknown(true);

export function validateEnv(config: Record<string, unknown>) {
  const { error, value } = envSchema.validate(config, { abortEarly: false });
  if (error) throw error;
  return value as Record<string, unknown>;
}
