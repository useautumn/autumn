import {
	type ApiBalanceV1,
	type ApiCustomerV5,
	getRelevantFeatures,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	expandCascadeDeductions,
	type FeatureDeduction,
} from "../types/featureDeduction.js";

/**
 * Builds the `balances` map for a track/check response: the tracked feature's
 * balance plus every linked credit system's balance (via getRelevantFeatures).
 * Entries are null when the customer has no balance for that feature.
 *
 * Returns undefined when fewer than two relevant balances exist (in that case
 * the single balance is exposed via the legacy `balance` field by
 * deductionToTrackResponse).
 */
export const deductionToBalancesResponse = ({
	ctx,
	apiCustomer,
	featureDeductions,
}: {
	ctx: AutumnContext;
	apiCustomer: ApiCustomerV5;
	featureDeductions: FeatureDeduction[];
}): Record<string, ApiBalanceV1 | null> | undefined => {
	const balances: Record<string, ApiBalanceV1 | null> = {};

	for (const deduction of expandCascadeDeductions(featureDeductions)) {
		const relevantFeatures = getRelevantFeatures({
			features: ctx.features,
			featureId: deduction.feature.id,
		});

		for (const feature of relevantFeatures) {
			balances[feature.id] = apiCustomer.balances[feature.id] ?? undefined;
		}
	}

	if (Object.keys(balances).length < 2) return undefined;
	return balances;
};
