import {
	type AggregatedFeatureBalance,
	AggregatedFeatureBalanceSchema,
} from "@autumn/shared";
import { normalizeFromSchema } from "./normalizeFromSchema.js";

export const sanitizeCachedAggregatedFeatureBalance = ({
	aggregated,
}: {
	aggregated: AggregatedFeatureBalance;
}): AggregatedFeatureBalance =>
	normalizeFromSchema<AggregatedFeatureBalance>({
		schema: AggregatedFeatureBalanceSchema,
		data: aggregated,
	});
