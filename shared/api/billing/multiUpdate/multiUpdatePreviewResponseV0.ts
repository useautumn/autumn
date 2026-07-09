import { z } from "zod/v4";
import {
	BillingPreviewResponseSchema,
	ExtBillingPreviewResponseSchema,
} from "../common/billingPreviewResponse";

const planIdsField = z.array(z.string()).meta({
	description: "The IDs of the plans updated on this subscription.",
});

/** The core billing preview, scoped to ONE Stripe subscription group. */
export const MultiUpdateSubscriptionPreviewV0Schema =
	BillingPreviewResponseSchema.extend({
		plan_ids: planIdsField,
	});

export const ExtMultiUpdateSubscriptionPreviewV0Schema =
	ExtBillingPreviewResponseSchema.extend({
		plan_ids: planIdsField,
	});

const multiUpdatePreviewBase = {
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
};

const subscriptionsMeta = {
	description:
		"One preview per affected Stripe subscription. Updates to plans without a subscription (free plans) produce no entry.",
};

export const ExtMultiUpdatePreviewResponseV0Schema = z.object({
	...multiUpdatePreviewBase,
	subscriptions: z
		.array(ExtMultiUpdateSubscriptionPreviewV0Schema)
		.meta(subscriptionsMeta),
});

export const MultiUpdatePreviewResponseV0Schema = z.object({
	object: z.literal("multi_update_preview").meta({ internal: true }),
	...multiUpdatePreviewBase,
	subscriptions: z
		.array(MultiUpdateSubscriptionPreviewV0Schema)
		.meta(subscriptionsMeta),
});

export type MultiUpdateSubscriptionPreviewV0 = z.infer<
	typeof MultiUpdateSubscriptionPreviewV0Schema
>;
export type MultiUpdatePreviewResponseV0 = z.infer<
	typeof MultiUpdatePreviewResponseV0Schema
>;
