import {
	addAllowanceToTiers,
	findTierByQuantity,
	formatAmount,
	numberWithCommas,
	type ProductItem,
	roundUsageToNearestBillingUnit,
	type UsageTier,
	volumeTiersToLineAmount,
} from "@autumn/shared";

export type VolumeExampleBill = {
	total: number;
	billedUsage: number;
	billedTier: UsageTier | undefined;
	isWithinIncluded: boolean;
	unitRate: number;
};

/** Bills `usage` with the shared volume pricing, plus the tier it lands in for the breakdown. */
export const itemToVolumeExampleBill = ({
	item,
	usage,
}: {
	item: ProductItem;
	usage: number;
}): VolumeExampleBill => {
	const tiers: UsageTier[] = (item.tiers ?? []).map((tier) => ({
		to: tier.to,
		amount: tier.amount ?? 0,
		flat_amount: tier.flat_amount ?? undefined,
	}));
	const allowance =
		typeof item.included_usage === "number" ? item.included_usage : 0;
	const billingUnits = item.billing_units || 1;
	const billedUsage = roundUsageToNearestBillingUnit({ usage, billingUnits });
	const billedTier = findTierByQuantity({
		tiers: addAllowanceToTiers({ tiers, allowance }),
		quantity: billedUsage,
	});

	return {
		total: volumeTiersToLineAmount({ tiers, usage, allowance, billingUnits }),
		billedUsage,
		billedTier,
		isWithinIncluded: billedUsage <= allowance,
		unitRate: (billedTier?.amount ?? 0) / billingUnits,
	};
};

/** Names the billed tier the way the tier table labels its rows. */
export const billedTierLabel = (bill: VolumeExampleBill): string => {
	if (bill.isWithinIncluded) return "Included";
	if (typeof bill.billedTier?.to !== "number") return "Unlimited";
	return `Up to ${numberWithCommas(bill.billedTier.to)}`;
};

export const formatBillAmount = ({
	amount,
	currency,
}: {
	amount: number;
	currency: string;
}) =>
	formatAmount({
		amount,
		currency,
		minFractionDigits: Number.isInteger(amount) ? 0 : 2,
		amountFormatOptions: { currencyDisplay: "narrowSymbol" },
	});
