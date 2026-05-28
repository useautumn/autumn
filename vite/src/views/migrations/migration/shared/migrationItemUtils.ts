import type {
	Feature,
	ProductItem,
	ProductItemInterval,
	UsageModel,
} from "@autumn/shared";
import { Infinite } from "@autumn/shared";
import { getDefaultItem } from "@/views/products/plan/utils/getDefaultItem";

export function migrationItemToProductItem(
	migItem: Record<string, unknown>,
	features: Feature[],
): ProductItem {
	const featureId = migItem.feature_id as string | undefined;
	const feature = featureId ? features.find((f) => f.id === featureId) : null;
	const base = feature
		? (getDefaultItem({ feature }) as ProductItem)
		: ({ feature_id: featureId } as ProductItem);

	if (migItem.unlimited === true) {
		base.included_usage = Infinite;
	} else if (migItem.included !== undefined) {
		base.included_usage = migItem.included as number;
	}
	const price = migItem.price as Record<string, unknown> | undefined;
	if (price) {
		base.tiers = [{ to: "inf", amount: Number(price.amount ?? 0) }];
		// null interval in ProductItem means one-off; the API uses "one_off"
		base.interval =
			price.interval && price.interval !== "one_off"
				? (price.interval as ProductItemInterval)
				: null;
		if (price.billing_method)
			base.usage_model = price.billing_method as UsageModel;
		base.billing_units = 1;
	} else {
		const reset = migItem.reset as Record<string, unknown> | undefined;
		if (reset?.interval) {
			base.interval = reset.interval as ProductItemInterval;
		} else if (!price) {
			// No price and no reset means one-off entitlement
			base.interval = null;
		}
	}
	return base;
}

export function productItemToMigrationItem(
	item: ProductItem,
): Record<string, unknown> {
	const result: Record<string, unknown> = { feature_id: item.feature_id };
	if (item.included_usage !== null && item.included_usage !== undefined) {
		if (item.included_usage === Infinite) {
			result.unlimited = true;
		} else {
			result.included = Number(item.included_usage);
		}
	}
	if (item.tiers && item.tiers.length > 0) {
		result.price = {
			amount: item.tiers[0].amount ?? 0,
			interval: item.interval ?? "one_off",
			billing_method: item.usage_model ?? undefined,
		};
	} else if (item.interval) {
		result.reset = { interval: item.interval };
	}
	return result;
}
