import {
	type ApiBalanceV1,
	type FullSubject,
	getRelevantFeatures,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getApiSubject } from "@/internal/customers/cusUtils/getApiCustomerV2/getApiSubject.js";
import {
	expandCascadeDeductions,
	type FeatureDeduction,
} from "../types/featureDeduction.js";

/**
 * V2 (FullSubject) variant of deductionToBalancesResponse — returns ALL
 * balances related to the tracked features (main + linked credit systems),
 * with null entries for features the customer has no entitlement to.
 */
export const deductionToBalancesResponseV2 = async ({
	ctx,
	fullSubject,
	featureDeductions,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	featureDeductions: FeatureDeduction[];
}): Promise<Record<string, ApiBalanceV1 | null> | undefined> => {
	const apiSubject = await getApiSubject({
		ctx,
		fullSubject,
		includeAggregations: true,
	});

	const balances: Record<string, ApiBalanceV1 | null> = {};

	for (const deduction of expandCascadeDeductions(featureDeductions)) {
		const relevantFeatures = getRelevantFeatures({
			features: ctx.features,
			featureId: deduction.feature.id,
		});

		for (const feature of relevantFeatures) {
			balances[feature.id] = apiSubject.balances?.[feature.id] ?? null;
		}
	}

	if (Object.keys(balances).length < 2) return undefined;
	return balances;
};
