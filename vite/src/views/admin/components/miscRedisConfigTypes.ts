import { z } from "zod/v4";

export const MISC_REDIS_CONFIG_QUERY_KEY = [
	"admin-edge-config",
	"misc-redis",
] as const;

export const CONFIRM_CLEAR_RAMP_TEXT = "clear";
export const CONFIRM_REMOVE_BACKUP_TEXT = "remove";
export const CONFIRM_HIGH_RAMP_TEXT = "ramp";
export const HIGH_RAMP_THRESHOLD = 25;

export const rampPercentSchema = z
	.string()
	.trim()
	.regex(/^\d+$/)
	.transform(Number)
	.pipe(z.number().int().min(0).max(100));

export type MiscRedisInstanceName = "main" | "backup";

export const MISC_REDIS_INSTANCE_OPTIONS: {
	value: MiscRedisInstanceName;
	label: string;
	description: string;
}[] = [
	{
		value: "main",
		label: "Main",
		description: "Env-configured (MISC_CACHE_DRAGONFLY_*_URL)",
	},
	{
		value: "backup",
		label: "Backup",
		description: "Encrypted connection stored in this config",
	},
];

export type MiscRedisRamp = {
	percent: number;
	previousPercent: number;
	changedAt: number;
};

export type MiscRedisConfigResponse = {
	activeInstance: MiscRedisInstanceName;
	ramp: MiscRedisRamp | null;
	backup: { host: string; hasPrivateConnectionString: boolean } | null;
	backupRoutable: boolean;
	configHealthy: boolean;
	configConfigured: boolean;
	lastSuccessAt: string | null;
	error: string | null;
};

export const otherInstance = (
	name: MiscRedisInstanceName,
): MiscRedisInstanceName => (name === "main" ? "backup" : "main");

export const requiresHighRampConfirm = ({
	nextPercent,
	currentPercent,
}: {
	nextPercent: number;
	currentPercent: number;
}) =>
	nextPercent - currentPercent >= HIGH_RAMP_THRESHOLD ||
	(nextPercent >= HIGH_RAMP_THRESHOLD && currentPercent < HIGH_RAMP_THRESHOLD);

/** The backup connection may only be edited while nothing routes to it. */
export const isBackupLive = (config: MiscRedisConfigResponse) =>
	config.activeInstance === "backup" ||
	(config.ramp !== null && config.activeInstance === "main");
