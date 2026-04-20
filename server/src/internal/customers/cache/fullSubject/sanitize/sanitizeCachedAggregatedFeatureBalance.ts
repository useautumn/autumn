import {
	type AggregatedFeatureBalance,
	AggregatedFeatureBalanceSchema,
} from "@autumn/shared";
import { normalizeFromSchema } from "./normalizeFromSchema.js";

/**
 * Repair an aggregated feature balance read from Redis (the `_aggregated`
 * hash field) so Upstash cjson null-drops and empty-collection swaps are
 * reversed before the value reaches downstream consumers.
 *
 * Walks against `AggregatedFeatureBalanceSchema` because the cache stores
 * the non-Full (no embedded feature) shape; see
 * `setSharedFullSubjectBalances.ts`.
 */
export const sanitizeCachedAggregatedFeatureBalance = ({
	aggregated,
}: {
	aggregated: AggregatedFeatureBalance;
}): AggregatedFeatureBalance =>
	normalizeFromSchema<AggregatedFeatureBalance>({
		schema: AggregatedFeatureBalanceSchema,
		data: aggregated,
	});
