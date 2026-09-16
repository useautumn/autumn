import type { ProductItem } from "../../../models/productV2Models/productItemModels/productItemModels.js";

const isUnsetOrZero = (value: number | null | undefined): boolean =>
	value === null || value === undefined || value === 0;

/** Every configured currency prices `billing_units` units at exactly `billing_units`, with no flat fees. */
export const isOneToOneUnitPriceItem = ({
	item,
}: {
	item: ProductItem;
}): boolean => {
	const billingUnits = item.billing_units ?? 1;
	if (billingUnits <= 0) return false;

	if (item.price !== null && item.price !== undefined) {
		return (
			item.price === billingUnits &&
			(item.additional_currencies ?? []).every(
				(currency) => currency.amount === billingUnits,
			)
		);
	}

	const tiers = item.tiers ?? [];
	if (tiers.length === 0) return false;
	return tiers.every(
		(tier) =>
			tier.amount === billingUnits &&
			isUnsetOrZero(tier.flat_amount) &&
			(tier.additional_currencies ?? []).every(
				(currency) =>
					currency.amount === billingUnits &&
					isUnsetOrZero(currency.flat_amount),
			),
	);
};
