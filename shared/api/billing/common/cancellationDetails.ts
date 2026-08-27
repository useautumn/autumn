import { z } from "zod/v4";

export const CancellationDetailsSchema = z
	.object({
		reason: z.string().min(1).optional().meta({
			description:
				"Why the subscription is being canceled. Stripe feedback values (too_expensive, unused, missing_features, switched_service, too_complex, low_quality, customer_service, other) are sent as cancellation_details.feedback; any other string is included in the comment.",
		}),
		details: z.string().min(1).optional().meta({
			description:
				"Additional comment forwarded to Stripe as cancellation_details.comment.",
		}),
	})
	.refine((data) => data.reason !== undefined || data.details !== undefined, {
		message: "cancellation_details requires reason or details",
	})
	.meta({
		title: "CancellationDetails",
		description:
			"Optional cancellation reason and details forwarded to Stripe when this update cancels the Stripe subscription.",
	});

export type CancellationDetails = z.infer<typeof CancellationDetailsSchema>;
