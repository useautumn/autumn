import { z } from "zod/v4";
import { MISC_REDIS_CONFIG_KEY } from "../../keys.js";

export const MiscRedisInstanceNameSchema = z.enum(["main", "backup"]);
export type MiscRedisInstanceName = z.infer<typeof MiscRedisInstanceNameSchema>;

const LEGACY_INSTANCE_MAP = { primary: "main", fallback: "backup" } as const;
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

export const otherMiscRedisInstance = (
	name: MiscRedisInstanceName,
): MiscRedisInstanceName => (name === "main" ? "backup" : "main");

export const MiscRedisRampSchema = z.object({
	percent: z.number().min(0).max(100).default(0),
	previousPercent: z.number().min(0).max(100).default(0),
	changedAt: z.number().default(0),
});
export type MiscRedisRamp = z.infer<typeof MiscRedisRampSchema>;

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

export const defaultMiscRedisConfig = (): MiscRedisConfig => ({
	activeInstance: "main",
	ramp: null,
	backup: null,
});

export const miscRedisEdgeConfig = {
	key: MISC_REDIS_CONFIG_KEY,
	schema: MiscRedisConfigSchema,
	defaultValue: defaultMiscRedisConfig,
} as const;
