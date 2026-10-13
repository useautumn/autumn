/**
 * The `credit_cost` a token track's event records: what each feature other than the AI credit system
 * itself was charged. Undefined when nothing else was charged.
 */
export const buildAiCreditCostProperty = ({
	aiCreditFeatureId,
	entries,
}: {
	aiCreditFeatureId: string;
	entries: Array<{ featureId: string; amount: number }>;
}): Record<string, number> | undefined => {
	const creditCost: Record<string, number> = {};
	for (const { featureId, amount } of entries) {
		if (featureId === aiCreditFeatureId) continue;
		if (!amount) continue;
		creditCost[featureId] = (creditCost[featureId] ?? 0) + amount;
	}

	return Object.keys(creditCost).length > 0 ? creditCost : undefined;
};
