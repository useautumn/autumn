import { ApiPlanV1Schema } from "@api/products/apiPlanV1";
import { z } from "zod/v4";

export const ApiSubscriptionV1Schema = z.object({
	plan: ApiPlanV1Schema.optional().meta({
		description: "The full plan object if expanded.",
	}),
	plan_id: z.string().meta({
		description: "The unique identifier of the subscribed plan.",
	}),

	auto_enable: z.boolean().meta({
		description: "Whether the plan was automatically enabled for the customer.",
	}),
	add_on: z.boolean().meta({
		description:
			"Whether this is an add-on plan rather than a base subscription.",
	}),

	status: z.enum(["active", "scheduled"]).meta({
		description: "Current status of the subscription.",
	}),
	past_due: z.boolean().meta({
		description: "Whether the subscription has overdue payments.",
	}),
	canceled_at: z.number().nullable().meta({
		description:
			"Timestamp when the subscription was canceled, or null if not canceled.",
	}),
	expires_at: z.number().nullable().meta({
		description:
			"Timestamp when the subscription will expire, or null if no expiry set.",
	}),
	trial_ends_at: z.number().nullable().meta({
		description:
			"Timestamp when the trial period ends, or null if not on trial.",
	}),

	started_at: z.number().meta({
		description: "Timestamp when the subscription started.",
	}),
	current_period_start: z.number().nullable().meta({
		description: "Start timestamp of the current billing period.",
	}),
	current_period_end: z.number().nullable().meta({
		description: "End timestamp of the current billing period.",
	}),
	quantity: z.number().meta({
		description: "Number of units of this subscription (for per-seat plans).",
	}),
});

export const ApiPurchaseV0Schema = z.object({
	plan: ApiPlanV1Schema.optional().meta({
		description: "The full plan object if expanded.",
	}),
	plan_id: z.string().meta({
		description: "The unique identifier of the purchased plan.",
	}),
	expires_at: z.number().nullable().meta({
		description:
			"Timestamp when the purchase expires, or null for lifetime access.",
	}),
	started_at: z.number().meta({
		description: "Timestamp when the purchase was made.",
	}),
	quantity: z.number().meta({
		description: "Number of units purchased.",
	}),
});

export type ApiSubscriptionV1 = z.infer<typeof ApiSubscriptionV1Schema>;
export type ApiPurchaseV0 = z.infer<typeof ApiPurchaseV0Schema>;
