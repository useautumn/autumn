import { z } from "zod/v4";

const envSchema = z.object({
	DATABASE_URL: z.string().min(1),
	LEDGER_PORT: z.coerce.number().int().positive().default(7000),
	LEDGER_LOG_DATASET: z.string().min(1).default("ledger"),
	NODE_ENV: z.string().min(1).default("development"),
});

export const env = envSchema.parse(process.env);
