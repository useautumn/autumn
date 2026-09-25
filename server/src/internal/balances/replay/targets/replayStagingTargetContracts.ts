import { z } from "zod/v4";

export const REPLAY_STAGING_BROKERS: readonly string[] = Object.freeze([
	"b-1.tfmeteringstaging.jfuutw.c3.kafka.us-east-1.amazonaws.com:9098",
	"b-2.tfmeteringstaging.jfuutw.c3.kafka.us-east-1.amazonaws.com:9098",
	"b-3.tfmeteringstaging.jfuutw.c3.kafka.us-east-1.amazonaws.com:9098",
	"b-4.tfmeteringstaging.jfuutw.c3.kafka.us-east-1.amazonaws.com:9098",
]);

export const REPLAY_STAGING_DEPLOYMENT = "tf-balance-staging-v2-64";

export const REPLAY_STAGING_OWNERSHIP_TOPIC =
	"tf-balance-staging-v2-64-ownership";

export const REPLAY_STAGING_PARTITION_COUNT = 64;

export const REPLAY_STAGING_REGION = "us-east-1";

export const REPLAY_STAGING_DEFAULT_DATABASE_PORT = 5432;

export const REPLAY_DATABASE_SUPPORTED_SCHEMES: ReadonlySet<string> = new Set([
	"postgres:",
	"postgresql:",
]);

export const REPLAY_DATABASE_ROUTING_QUERY_KEYS: ReadonlySet<string> = new Set([
	"host",
	"hostaddr",
	"port",
	"dbname",
	"service",
	"servicefile",
	"options",
]);

export const REPLAY_DATABASE_ALLOWED_QUERY_KEYS: ReadonlySet<string> = new Set([
	"sslmode",
	"application_name",
	"connect_timeout",
]);

export const replayStagingTargetInputSchema = z.strictObject({
	databaseUrl: z.string().min(1),
	brokers: z.array(z.string().min(1)),
	deployment: z.string().min(1),
	topic: z.string().min(1),
	partitionCount: z.number().int(),
	region: z.string().min(1),
});

export const replayStagingTargetPolicySchema = z.strictObject({
	database: z.strictObject({
		hostname: z.string().min(1),
		port: z.number().int().min(1).max(65_535),
		database: z.string().min(1),
	}),
});

export type ReplayStagingTargetInput = z.infer<
	typeof replayStagingTargetInputSchema
>;

export type ReplayStagingTargetPolicy = z.infer<
	typeof replayStagingTargetPolicySchema
>;

export type ReplayStagingDatabasePolicy = ReplayStagingTargetPolicy["database"];

export type ReplayStagingDatabaseTarget = Readonly<{
	hostname: string;
	port: number;
	database: string;
}>;

export type ValidatedReplayStagingTarget = Readonly<{
	deployment: string;
	topic: string;
	partitionCount: number;
	region: string;
	brokers: readonly string[];
	database: ReplayStagingDatabaseTarget;
}>;

export type ReplayTargetValidationIssue = Readonly<{
	path: readonly PropertyKey[];
	message: string;
}>;

export class ReplayStagingTargetError extends Error {
	constructor({ message }: { message: string }) {
		super(message);
		this.name = "ReplayStagingTargetError";
	}
}
