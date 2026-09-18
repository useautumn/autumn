import type { InvoiceCustomize, ProductItem } from "@autumn/shared";
import {
	BillingMethod,
	itemToBillingInterval,
	itemToBillingIntervalCount,
	UsageModel,
} from "@autumn/shared";

const isBasePriceItem = (item: ProductItem) => !item.feature_id;

const billingMethodOf = (item: ProductItem) =>
	item.usage_model === UsageModel.Prepaid
		? BillingMethod.Prepaid
		: BillingMethod.UsageBased;

const defined = <T extends object>(value: T): T =>
	Object.fromEntries(
		Object.entries(value).filter(([, v]) => v !== null && v !== undefined),
	) as T;

/**
 * The plan editor works in catalog ProductItems, but customize accepts pricing
 * fields only and rejects anything else.
 */
export function productItemsToInvoiceCustomize({
	items,
}: {
	items: ProductItem[] | null;
}): InvoiceCustomize | undefined {
	if (!items) return undefined;

	const baseItem = items.find(isBasePriceItem);
	const featureItems = items.filter(
		(item): item is ProductItem & { feature_id: string } =>
			Boolean(item.feature_id),
	);

	const customize: InvoiceCustomize = {
		price: baseItem
			? {
					amount: baseItem.price ?? 0,
					interval: itemToBillingInterval({ item: baseItem }),
					interval_count: itemToBillingIntervalCount({ item: baseItem }),
				}
			: null,
	};

	const priced = featureItems.flatMap((item) => {
		const price = defined({
			amount: item.price,
			tiers: item.tiers,
			tier_behavior: item.tier_behavior,
			interval: itemToBillingInterval({ item }),
			interval_count: itemToBillingIntervalCount({ item }),
			billing_units: item.billing_units,
			billing_method: billingMethodOf(item),
		});
		if (price.amount === undefined && !price.tiers) return [];
		return [{ feature_id: item.feature_id, price }];
	});

	return priced.length > 0
		? { ...customize, items: priced as InvoiceCustomize["items"] }
		: customize;
}
