import {
	addAllowanceToTiers,
	findTierByQuantity,
	numberWithCommas,
	type ProductItem,
	roundUsageToNearestBillingUnit,
	UsageModel,
	type UsageTier,
	volumeTiersToLineAmount,
} from "@autumn/shared";
import { tierPriceInCurrency } from "./currencyUtils";
import { itemToIncludedUsage } from "./tierUtils";

/** Bills `usage` like `usagePriceToLineItem`: usage-based bills the overage past included at the
 * tier total usage reaches; prepaid bills every unit. Prices come from `currency`'s cells only. */
export const itemToVolumeExampleBill = ({
	item,
	usage,
	currency,
	baseCurrency,
}: {
	item: ProductItem;
	usage: number;
	currency: string;
	baseCurrency: string;
}) => {
	const tiers: UsageTier[] = (item.tiers ?? []).map((tier) => {
		const price = tierPriceInCurrency({ tier, code: currency, baseCurrency });
		return {
			to: tier.to,
			amount: price.amount ?? 0,
			flat_amount: price.flat_amount ?? undefined,
		};
	});
	const included = itemToIncludedUsage(item);
	const billingUnits = item.billing_units || 1;
	const tierShift = item.usage_model === UsageModel.Prepaid ? included : 0;
	const billedUsage = roundUsageToNearestBillingUnit({
		usage: Math.max(0, usage - included + tierShift),
		billingUnits,
	});
	const billedTier = findTierByQuantity({
		tiers: addAllowanceToTiers({ tiers, allowance: included }),
		quantity: billedUsage + included - tierShift,
	});
	const isWithinIncluded = usage <= included;
	const total = volumeTiersToLineAmount({
		tiers,
		usage: billedUsage,
		allowance: tierShift,
		billingUnits,
	});

	return {
		total: isWithinIncluded ? 0 : total,
		billedUsage,
		billedTier,
		isWithinIncluded,
		unitRate: (billedTier?.amount ?? 0) / billingUnits,
	};
};

/** Names the billed tier the way the tier table labels its rows. */
export const billedTierLabel = ({
	isWithinIncluded,
	billedTier,
}: ReturnType<typeof itemToVolumeExampleBill>) => {
	if (isWithinIncluded) return "Included";
	if (typeof billedTier?.to !== "number") return "Unlimited";
	return `Up to ${numberWithCommas(billedTier.to)}`;
};
