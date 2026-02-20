import { z } from "zod/v4";

export const AttachDiscountSchema = z
	.object({
		reward_id: z.string().optional().meta({
			description: "The ID of the reward to apply as a discount.",
		}),
		promotion_code: z.string().optional().meta({
			description: "The promotion code to apply as a discount.",
		}),
	})
	.refine((data) => data.reward_id || data.promotion_code, {
		message: "Either reward_id or promotion_code must be provided.",
	})
	.meta({
		title: "AttachDiscount",
		description:
			"A discount to apply. Can be either a reward ID or a promotion code.",
	});

export type AttachDiscount = z.infer<typeof AttachDiscountSchema>;
