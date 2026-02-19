import { z } from "zod/v4";

export const AttachDiscountSchema = z
	.union([
		z.object({
			reward_id: z.string().meta({
				description: "The ID of the reward to apply as a discount.",
			}),
		}),
		z.object({
			promotion_code: z.string().meta({
				description: "The promotion code to apply as a discount.",
			}),
		}),
	])
	.meta({
		description:
			"A discount to apply. Can be either a reward ID or a promotion code.",
	});

export type AttachDiscount = z.infer<typeof AttachDiscountSchema>;
