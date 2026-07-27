import { z } from "zod/v4";

export const CONFIRM_REMOVE_TEXT = "remove";
export const CONFIRM_HIGH_RAMP_TEXT = "ramp";
export const HIGH_RAMP_THRESHOLD = 25;

export const migrationPercentSchema = z
	.string()
	.trim()
	.regex(/^\d+$/)
	.transform(Number)
	.pipe(z.number().int().min(0).max(100));

export type CacheV2Ramp = {
	host: string;
	migrationPercent: number;
	previousMigrationPercent: number;
	migrationChangedAt: number;
};

export type AdminCacheV2RampResponse = {
	cache_v2_ramp: CacheV2Ramp | null;
};

export const CACHE_V2_RAMP_QUERY_KEY = ["admin-cache-v2-ramp"] as const;

export const requiresHighRampConfirm = ({
	nextPercent,
	currentPercent,
}: {
	nextPercent: number;
	currentPercent: number;
}) =>
	nextPercent - currentPercent >= HIGH_RAMP_THRESHOLD ||
	(nextPercent >= HIGH_RAMP_THRESHOLD && currentPercent < HIGH_RAMP_THRESHOLD);
