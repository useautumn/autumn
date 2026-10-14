import {
	type ApiBalanceV1,
	type FullSubject,
	fullSubjectToRelevantFeatures,
	getApiSubject,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { FeatureDeduction } from "../types/featureDeduction.js";

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

	for (const deduction of featureDeductions) {
		const relevantFeatures = fullSubjectToRelevantFeatures({
			fullSubject,
			featureId: deduction.feature.id,
			features: ctx.features,
		});

		for (const feature of relevantFeatures) {
			balances[feature.id] = apiSubject.balances?.[feature.id] ?? null;
		}
	}

	if (Object.keys(balances).length < 2) return undefined;
	return balances;
};
