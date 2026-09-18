import type { Reward } from "@autumn/shared";
import { RewardType } from "@autumn/shared";
import type { FormDiscount } from "../../attach-v2/utils/discountUtils";

export type InvoiceDiscountRow = { label: string; amount: number };

/**
 * Stripe lists each coupon on its own row and applies them in order, so a
 * percentage coupon discounts what is left after the ones before it. Rows are
 * rounded per line while the server rounds once, so the last row absorbs the
 * difference and the displayed rows always sum to the invoice's discount.
 */
export function invoiceDiscountRows({
	discounts,
	rewardsById,
	subtotal,
	discountTotal,
}: {
	discounts: FormDiscount[];
	rewardsById: Map<string, Reward>;
	subtotal: number;
	discountTotal: number;
}): InvoiceDiscountRow[] {
	const rewards = discounts.flatMap((discount) => {
		const id = "reward_id" in discount ? discount.reward_id : undefined;
		const reward = id ? rewardsById.get(id) : undefined;
		return reward ? [reward] : [];
	});

	if (rewards.length < 2) {
		return discountTotal > 0
			? [{ label: rewards[0]?.name ?? "Discount", amount: discountTotal }]
			: [];
	}

	let remaining = subtotal;
	const rows = rewards.flatMap((reward) => {
		const value = reward.discount_config?.discount_value ?? 0;
		const isFixed = reward.type === RewardType.FixedDiscount;
		const amount = isFixed
			? Math.min(value, remaining)
			: Math.round(remaining * value) / 100;
		if (amount <= 0) return [];

		remaining -= amount;
		const suffix = isFixed ? `$${value.toFixed(2)} off` : `${value}% off`;
		return [{ label: `${reward.name} (${suffix})`, amount }];
	});

	const shown = rows.reduce((sum, row) => sum + row.amount, 0);
	const drift = Math.round((discountTotal - shown) * 100) / 100;

	return rows.map((row, index) =>
		index === rows.length - 1 ? { ...row, amount: row.amount + drift } : row,
	);
}
