import {
	type ApiBalanceV1,
	type FullCustomer,
	getRelevantFeatures,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getApiCustomerBase } from "@/internal/customers/cusUtils/apiCusUtils/getApiCustomerBase.js";
import type { FeatureDeduction } from "../types/featureDeduction.js";

/**
 * Builds the `balances` map for a track/check response: the tracked feature's
 * balance plus every linked credit system's balance (via getRelevantFeatures).
 * Entries are null when the customer has no balance for that feature.
 *
 * Returns undefined when fewer than two relevant balances exist (in that case
 * the single balance is exposed via the legacy `balance` field by
 * deductionToTrackResponse).
 */
export const deductionToBalancesResponse = async ({
	ctx,
	fullCus,
	featureDeductions,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	featureDeductions: FeatureDeduction[];
}): Promise<Record<string, ApiBalanceV1 | null> | undefined> => {
	const { apiCustomer } = await getApiCustomerBase({ ctx, fullCus });

	const balances: Record<string, ApiBalanceV1 | null> = {};

	for (const deduction of featureDeductions) {
		const relevantFeatures = getRelevantFeatures({
			features: ctx.features,
			featureId: deduction.feature.id,
		});

		for (const feature of relevantFeatures) {
			balances[feature.id] = apiCustomer.balances[feature.id] ?? null;
		}
	}

	if (Object.keys(balances).length < 2) return undefined;
	return balances;
};
