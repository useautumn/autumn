import { z } from "zod/v4";
import { BillingPreviewResponseSchema } from "../common/billingPreviewResponse";

/** The core billing preview, scoped to ONE Stripe subscription group. */
export const MultiUpdateSubscriptionPreviewV0Schema =
	BillingPreviewResponseSchema.extend({
		plan_ids: z.array(z.string()).meta({
			description: "The IDs of the plans updated on this subscription.",
		}),
	});

export const MultiUpdatePreviewResponseV0Schema = z.object({
	object: z.literal("multi_update_preview").meta({ internal: true }),
	customer_id: z.string().meta({
		description: "The ID of the customer the preview applies to.",
	}),
	currency: z.string().meta({
		description: "The three-letter ISO currency code (e.g., 'usd').",
	}),
	total: z.number().meta({
		description:
			"The combined amount due today across all subscriptions (sum of subscriptions[].total).",
	}),
	subscriptions: z.array(MultiUpdateSubscriptionPreviewV0Schema).meta({
		description:
			"One preview per affected Stripe subscription. Updates to plans without a subscription (free plans) produce no entry.",
	}),
});

export type MultiUpdateSubscriptionPreviewV0 = z.infer<
	typeof MultiUpdateSubscriptionPreviewV0Schema
>;
export type MultiUpdatePreviewResponseV0 = z.infer<
	typeof MultiUpdatePreviewResponseV0Schema
>;
