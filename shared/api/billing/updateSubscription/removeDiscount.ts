import { z } from "zod/v4";

export const RemoveDiscountSchema = z
	.strictObject({
		reward_id: z.string().meta({
			description: "The ID of the reward (or Stripe coupon) to remove.",
		}),
	})
	.meta({
		title: "RemoveDiscount",
		description:
			"A discount to remove from the subscription. Discounts that are no longer applied are ignored.",
	});

export type RemoveDiscount = z.infer<typeof RemoveDiscountSchema>;

export const RemoveDiscountsSchema = z.array(RemoveDiscountSchema);

/** Adding and removing the same reward in one request is ambiguous, so it's rejected. */
export const addsAndRemovesSameReward = ({
	discounts,
	remove_discounts,
}: {
	discounts?: { reward_id?: string }[];
	remove_discounts?: RemoveDiscount[];
}) => {
	const removedRewardIds = new Set(
		(remove_discounts ?? []).map((discount) => discount.reward_id),
	);
	return (discounts ?? []).some(
		(discount) =>
			discount.reward_id !== undefined &&
			removedRewardIds.has(discount.reward_id),
	);
};

export const ADDS_AND_REMOVES_SAME_REWARD_MESSAGE =
	"Cannot add and remove the same reward_id in one request.";
