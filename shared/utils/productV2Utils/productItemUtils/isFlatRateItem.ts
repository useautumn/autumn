import type { ProductItem } from "../../../models/productV2Models/productItemModels/productItemModels.js";
import { TierInfinite } from "../../../models/productV2Models/productItemModels/productItemModels.js";

const isUnsetOrZero = (value: number | null | undefined): boolean =>
	value === null || value === undefined || value === 0;

/** One positive rate for every unit: a plain price, or a single open-ended tier with no flat fee. */
export const isFlatRateItem = ({ item }: { item: ProductItem }): boolean => {
	if ((item.billing_units ?? 1) <= 0) return false;
	if (item.price !== null && item.price !== undefined) return item.price > 0;

	const tiers = item.tiers ?? [];
	if (tiers.length !== 1) return false;
	const [tier] = tiers;
	return (
		tier.to === TierInfinite &&
		tier.amount > 0 &&
		isUnsetOrZero(tier.flat_amount) &&
		(tier.additional_currencies ?? []).every((currency) =>
			isUnsetOrZero(currency.flat_amount),
		)
	);
};
