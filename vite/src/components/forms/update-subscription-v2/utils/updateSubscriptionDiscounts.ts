import type { UpdateSubscriptionDiscount } from "@autumn/shared";
import {
	type FormDiscount,
	toApiDiscounts,
} from "@/components/forms/attach-v2/utils/discountUtils";

/** Form state → `discounts` request param: new rows are added, marked rewards removed. */
export const buildUpdateSubscriptionDiscounts = ({
	discounts,
	removedRewardIds,
}: {
	discounts: FormDiscount[];
	removedRewardIds: string[];
}): UpdateSubscriptionDiscount[] | undefined => {
	const selectedDiscounts = discounts.filter(
		(discount) => "reward_id" in discount && discount.reward_id,
	);
	const params: UpdateSubscriptionDiscount[] = [
		...toApiDiscounts(selectedDiscounts).map((discount) => ({
			...discount,
			action: "add" as const,
		})),
		...removedRewardIds.map((rewardId) => ({
			action: "remove" as const,
			reward_id: rewardId,
		})),
	];

	return params.length > 0 ? params : undefined;
};

/** Inverse of `buildUpdateSubscriptionDiscounts`, for seeding the form from a request. */
export const splitUpdateSubscriptionDiscounts = (
	discounts: Array<{
		action?: string;
		reward_id?: string;
		promotion_code?: string;
	}>,
): { discounts: FormDiscount[]; removedRewardIds: string[] } => ({
	discounts: discounts
		.filter((discount) => discount.action !== "remove")
		.map(({ action: _action, ...discount }, index) => ({
			...discount,
			_id: `seeded-discount-${index}`,
		})),
	removedRewardIds: discounts.flatMap((discount) =>
		discount.action === "remove" && discount.reward_id
			? [discount.reward_id]
			: [],
	),
});
