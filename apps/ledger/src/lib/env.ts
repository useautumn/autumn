import { z } from "zod/v4";

const envSchema = z.object({
	DATABASE_URL: z.string().min(1),
	LEDGER_PORT: z.coerce.number().int().positive().default(7000),
	LEDGER_LOG_DATASET: z.string().min(1).default("ledger"),
	// Unset keeps the journal in memory: the shard runs without a broker.
	LEDGER_KAFKA_BROKERS: z.string().min(1).optional(),
	LEDGER_KAFKA_CLIENT_ID: z.string().min(1).default("ledger"),
	LEDGER_STALENESS_POLL_MS: z.coerce.number().int().positive().default(2_000),
	NODE_ENV: z.string().min(1).default("development"),
});

export const env = envSchema.parse(process.env);

export const kafkaBrokers = (): string[] =>
	env.LEDGER_KAFKA_BROKERS?.split(",")
		.map((broker) => broker.trim())
		.filter(Boolean) ?? [];
