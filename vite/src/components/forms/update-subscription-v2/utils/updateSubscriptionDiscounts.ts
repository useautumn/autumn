import type { AttachDiscount, RemoveDiscount } from "@autumn/shared";
import {
	type FormDiscount,
	toApiDiscounts,
} from "@/components/forms/attach-v2/utils/discountUtils";

/** Form state → request params: new rows go to `discounts`, marked rewards to `remove_discounts`. */
export const buildUpdateSubscriptionDiscounts = ({
	discounts,
	removedRewardIds,
}: {
	discounts: FormDiscount[];
	removedRewardIds: string[];
}): {
	discounts?: AttachDiscount[];
	remove_discounts?: RemoveDiscount[];
} => {
	const selectedDiscounts = toApiDiscounts(
		discounts.filter(
			(discount) => "reward_id" in discount && discount.reward_id,
		),
	);

	return {
		discounts: selectedDiscounts.length > 0 ? selectedDiscounts : undefined,
		remove_discounts:
			removedRewardIds.length > 0
				? removedRewardIds.map((rewardId) => ({ reward_id: rewardId }))
				: undefined,
	};
};
