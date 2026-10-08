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

/**
 * quantity and usage are mutually exclusive on a feature entry. A feature priced both
 * ways bills `quantities` as its prepaid line and `overageQuantities` as its usage line.
 */
export function convertToInvoiceFeatureQuantities({
	quantities,
	overageQuantities = {},
	usageEntries,
	items,
}: {
	quantities: Record<string, number | undefined>;
	overageQuantities?: Record<string, number | undefined>;
	usageEntries?: Record<string, InvoiceUsageEntry[] | undefined>;
	items?: ProductItem[] | null;
}): InvoiceFeatureQuantity[] | undefined {
	const billingMethodsByFeatureId = new Map<string, Set<BillingMethod>>();
	for (const item of items ?? []) {
		if (!item.feature_id || !item.usage_model) continue;
		const methods = billingMethodsByFeatureId.get(item.feature_id) ?? new Set();
		methods.add(usageModelToBillingMethod({ usageModel: item.usage_model }));
		billingMethodsByFeatureId.set(item.feature_id, methods);
	}
	const billingMethodByFeatureId = new Map(
		[...billingMethodsByFeatureId].map(([featureId, methods]) => [
			featureId,
			methods.has(BillingMethod.Prepaid)
				? BillingMethod.Prepaid
				: BillingMethod.UsageBased,
		]),
	);

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

	for (const [featureId, quantity] of Object.entries(overageQuantities)) {
		const methods = billingMethodsByFeatureId.get(featureId);
		const pricedBothWays =
			methods?.has(BillingMethod.Prepaid) &&
			methods.has(BillingMethod.UsageBased);
		if (!pricedBothWays || quantity === undefined) continue;
		result.push({
			feature_id: featureId,
			billing_behavior: BillingMethod.UsageBased,
			quantity,
		});
	}

	return result.length > 0 ? result : undefined;
}
