import { z } from "zod/v4";
import {
	AttachDiscountFieldsSchema,
	hasDiscountReference,
} from "../attachV2/attachDiscount";

const AddSubscriptionDiscountSchema = AttachDiscountFieldsSchema.extend({
	action: z.literal("add").default("add").meta({
		description: "Adds the discount. Omitting `action` also adds it.",
	}),
}).refine(hasDiscountReference, {
	message: "Either reward_id or promotion_code must be provided.",
});

const RemoveSubscriptionDiscountSchema = z.strictObject({
	action: z.literal("remove").meta({
		description:
			"Removes the discount from this subscription. Already-removed discounts are ignored.",
	}),
	reward_id: z.string().meta({
		description: "The ID of the reward (or Stripe coupon) to remove.",
	}),
});

export const UpdateSubscriptionDiscountSchema = z
	.union([RemoveSubscriptionDiscountSchema, AddSubscriptionDiscountSchema])
	.meta({
		title: "UpdateSubscriptionDiscount",
		description:
			"A discount to add (by reward ID or promotion code) or remove (by reward ID). Discounts not listed are left unchanged.",
	});

export type UpdateSubscriptionDiscount = z.infer<
	typeof UpdateSubscriptionDiscountSchema
>;
export type RemoveSubscriptionDiscount = z.infer<
	typeof RemoveSubscriptionDiscountSchema
>;

export const isRemoveSubscriptionDiscount = (
	discount: object,
): discount is RemoveSubscriptionDiscount =>
	"action" in discount && discount.action === "remove";

const addsAndRemovesSameReward = (discounts: UpdateSubscriptionDiscount[]) => {
	const removedRewardIds = new Set(
		discounts.filter(isRemoveSubscriptionDiscount).map((d) => d.reward_id),
	);
	return discounts.some(
		(discount) =>
			!isRemoveSubscriptionDiscount(discount) &&
			discount.reward_id !== undefined &&
			removedRewardIds.has(discount.reward_id),
	);
};

export const UpdateSubscriptionDiscountsSchema = z
	.array(UpdateSubscriptionDiscountSchema)
	.refine((discounts) => !addsAndRemovesSameReward(discounts), {
		message: "Cannot add and remove the same reward_id in one request.",
	});
