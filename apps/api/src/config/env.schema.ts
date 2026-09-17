import Joi from 'joi';

export const envSchema = Joi.object({
  DATABASE_URL: Joi.string().uri({ scheme: ['postgres', 'postgresql'] }).allow('').optional(),
  HOST: Joi.string().default('0.0.0.0'),
  MAX_ARCHIVE_ENTRIES: Joi.number().integer().positive().default(10_000),
  MAX_UNCOMPRESSED_BYTES: Joi.number().integer().positive().default(2_147_483_648),
  MAX_UPLOAD_BYTES: Joi.number().integer().positive().default(268_435_456),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(3001),
  STORAGE_DIR: Joi.string().default('.storage'),
  CHART_STORAGE_DIR: Joi.string().default('.storage/chart-data'),
  CHART_ASSET_BASE_URL: Joi.string().uri().allow('').optional(),
}).unknown(true);

export function validateEnv(config: Record<string, unknown>) {
  const { error, value } = envSchema.validate(config, { abortEarly: false });
  if (error) throw error;
  return value as Record<string, unknown>;
}
