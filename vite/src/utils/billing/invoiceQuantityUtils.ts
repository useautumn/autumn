import {
	BillingMethod,
	type InvoiceFeatureQuantity,
	type InvoiceUsageEntry,
	type ProductItem,
	UsageModel,
} from "@autumn/shared";

export function usageModelToBillingMethod({
	usageModel,
}: {
	usageModel: UsageModel | undefined | null;
}): BillingMethod {
	return usageModel === UsageModel.Prepaid
		? BillingMethod.Prepaid
		: BillingMethod.UsageBased;
}

/** quantity and usage are mutually exclusive on a feature entry. */
export function convertToInvoiceFeatureQuantities({
	quantities,
	usageEntries,
	items,
}: {
	quantities: Record<string, number | undefined>;
	usageEntries?: Record<string, InvoiceUsageEntry[] | undefined>;
	items?: ProductItem[] | null;
}): InvoiceFeatureQuantity[] | undefined {
	const billingMethodByFeatureId = new Map<string, BillingMethod>();
	for (const item of items ?? []) {
		if (!item.feature_id || billingMethodByFeatureId.has(item.feature_id)) {
			continue;
		}
		billingMethodByFeatureId.set(
			item.feature_id,
			usageModelToBillingMethod({ usageModel: item.usage_model }),
		);
	}

	const featureIds = new Set([
		...Object.keys(quantities),
		...Object.keys(usageEntries ?? {}),
	]);

	const result: InvoiceFeatureQuantity[] = [];
	for (const featureId of featureIds) {
		const usage = usageEntries?.[featureId]?.filter(
			(used) => used.quantity > 0,
		);
		const hasUsage = (usage?.length ?? 0) > 0;
		const quantity = quantities[featureId];
		if (!hasUsage && quantity === undefined) continue;

		result.push({
			feature_id: featureId,
			billing_behavior:
				billingMethodByFeatureId.get(featureId) ?? BillingMethod.UsageBased,
			...(hasUsage ? { usage } : { quantity }),
		});
	}

	return result.length > 0 ? result : undefined;
}
