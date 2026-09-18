import type { Reward } from "@autumn/shared";
import { CouponDurationType } from "@autumn/shared";
import type { FormDiscount } from "../../attach-v2/utils/discountUtils";
import type { CreateInvoiceForm } from "../createInvoiceFormSchema";

const rewardIdsOf = ({ discounts }: { discounts: FormDiscount[] }) =>
	discounts.flatMap((discount) =>
		"reward_id" in discount && discount.reward_id ? [discount.reward_id] : [],
	);

/** Surfaces what invoices.create would refuse, instead of a raw 400. */
export function findBlockingDiscount({
	form,
	rewardsById,
}: {
	form: CreateInvoiceForm;
	rewardsById?: Map<string, Reward>;
}): string | null {
	if (!rewardsById || rewardsById.size === 0) return null;

	const allRewardIds = rewardIdsOf({ discounts: form.discounts });

	// Stripe cannot apply a repeating coupon to a one-off invoice.
	for (const rewardId of allRewardIds) {
		const reward = rewardsById.get(rewardId);
		if (reward?.discount_config?.duration_type === CouponDurationType.Months) {
			return `Coupon ${rewardId} repeats monthly and cannot be applied to a one-off invoice.`;
		}
	}

	return null;
}
