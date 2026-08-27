import { z } from "zod/v4";

export const SubscriptionParamsSchema = z
	.record(z.string(), z.unknown())
	.meta({
		title: "SubscriptionParams",
		description:
			"Additional parameters to pass into the Stripe subscription update or cancel call.",
	});

export type SubscriptionParams = z.infer<typeof SubscriptionParamsSchema>;
