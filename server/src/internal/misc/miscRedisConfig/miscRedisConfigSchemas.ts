import { z } from "zod/v4";

/**
 * Exactly two misc-cache instances:
 *  - main:   env-configured — MISC_CACHE_DRAGONFLY_PRIVATE_URL/_PUBLIC_URL
 *            (ECS prefers private). Post-migration the backup slot frees up.
 *  - backup: encrypted connection strings stored in this edge config — the
 *            migration target / point-anywhere override.
 */
export const MiscRedisInstanceNameSchema = z.enum(["main", "backup"]);
export type MiscRedisInstanceName = z.infer<typeof MiscRedisInstanceNameSchema>;

/** Legacy values still written by stored S3 payloads / the old admin UI. */
const LEGACY_INSTANCE_MAP = {
	primary: "main",
	fallback: "backup",
} as const;
type LegacyInstanceName = keyof typeof LEGACY_INSTANCE_MAP;

const ActiveInstanceSchema = z
	.union([MiscRedisInstanceNameSchema, z.enum(["primary", "fallback"])])
	.transform(
		(name): MiscRedisInstanceName =>
			name === "primary" || name === "fallback"
				? LEGACY_INSTANCE_MAP[name as LegacyInstanceName]
				: name,
	);

export const toLegacyMiscRedisInstanceName = (
	name: MiscRedisInstanceName,
): string => (name === "main" ? "primary" : "fallback");

/** Ramp always flows toward the instance that is NOT active. */
export const MiscRedisRampSchema = z.object({
	percent: z.number().min(0).max(100).default(0),
	previousPercent: z.number().min(0).max(100).default(0),
	changedAt: z.number().default(0),
});
export type MiscRedisRamp = z.infer<typeof MiscRedisRampSchema>;

/** Connection strings are AES-256-CBC encrypted (same scheme as per-org
 *  redis_config). `publicConnectionString` is required — reachable from
 *  anywhere. `privateConnectionString` is the optional VPC endpoint ECS
 *  prefers when set. `url` is a plain host:port for logs. */
export const MiscRedisBackupSchema = z.object({
	publicConnectionString: z.string().min(1),
	privateConnectionString: z.string().min(1).nullable().default(null),
	url: z.string().min(1),
});
export type MiscRedisBackup = z.infer<typeof MiscRedisBackupSchema>;

export const MiscRedisConfigSchema = z.object({
	activeInstance: ActiveInstanceSchema.default("main"),
	ramp: MiscRedisRampSchema.nullable().default(null),
	backup: MiscRedisBackupSchema.nullable().default(null),
});
export type MiscRedisConfig = z.infer<typeof MiscRedisConfigSchema>;

export const otherMiscRedisInstance = (
	name: MiscRedisInstanceName,
): MiscRedisInstanceName => (name === "main" ? "backup" : "main");
