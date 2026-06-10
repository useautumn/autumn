import type { FeatureDeduction } from "../../utils/types/featureDeduction.js";

/**
 * Aggregates the amounts deducted from each metered feature into a `credit_cost`
 * map for an AI credit-system track, so the event records what each feature was
 * charged. Returns undefined when the track isn't an AI credit deduction or
 * nothing chargeable was deducted. The AI feature's own deduction is excluded so
 * the map only contains the downstream metered features it consumed.
 */
export const buildAiCreditCostProperty = ({
	featureDeductions,
	entries,
}: {
	featureDeductions: FeatureDeduction[];
	entries: Array<{ featureId: string; amount: number }>;
}): Record<string, number> | undefined => {
	const aiDeduction = featureDeductions.find((d) => d.tokens);
	if (!aiDeduction) return;

	const creditCost: Record<string, number> = {};
	for (const { featureId, amount } of entries) {
		if (featureId === aiDeduction.feature.id) continue;
		if (!amount) continue;
		creditCost[featureId] = (creditCost[featureId] ?? 0) + amount;
	}

	return Object.keys(creditCost).length > 0 ? creditCost : undefined;
};
