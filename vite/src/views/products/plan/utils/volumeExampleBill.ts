import {
	addAllowanceToTiers,
	findTierByQuantity,
	formatAmount,
	numberWithCommas,
	type ProductItem,
	roundUsageToNearestBillingUnit,
	UsageModel,
	type UsageTier,
	volumeTiersToLineAmount,
} from "@autumn/shared";
import { itemToIncludedUsage } from "./tierUtils";

export type VolumeExampleBill = {
	total: number;
	billedUsage: number;
	billedTier: UsageTier | undefined;
	isWithinIncluded: boolean;
	unitRate: number;
};

/** Bills `usage` the way `usagePriceToLineItem` does: usage-based bills the overage past
 * included at the tier total usage reaches; prepaid bills every unit on allowance-shifted tiers. */
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
	const allowance = itemToIncludedUsage(item);
	const billingUnits = item.billing_units || 1;
	const isPrepaid = item.usage_model === UsageModel.Prepaid;
	const tierShift = isPrepaid ? allowance : 0;
	const billedQuantity = isPrepaid ? usage : Math.max(0, usage - allowance);
	const billedUsage = roundUsageToNearestBillingUnit({
		usage: billedQuantity,
		billingUnits,
	});
	const isWithinIncluded = usage <= allowance;
	const billedTier = findTierByQuantity({
		tiers: addAllowanceToTiers({ tiers, allowance }),
		quantity: billedUsage + allowance - tierShift,
	});
	const total = volumeTiersToLineAmount({
		tiers,
		usage: billedQuantity,
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
