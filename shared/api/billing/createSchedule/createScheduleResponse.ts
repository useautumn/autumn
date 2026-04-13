import {
	BillingResponseRequiredActionSchema,
	BillingResponseSchema,
} from "@api/billing/common/billingResponse";
import { z } from "zod/v4";

export const CreateScheduleResponsePhaseSchema = z.object({
	phase_id: z.string().meta({
		description: "The ID of the persisted phase row.",
	}),
	starts_at: z.number().meta({
		description: "When this phase starts, in epoch milliseconds.",
	}),
	customer_product_ids: z.array(z.string()).meta({
		description: "Customer products materialized for this phase.",
	}),
});

export const CreateScheduleResponseSchema = z.object({
	customer_id: z.string().meta({
		description: "The ID of the customer.",
	}),
	entity_id: z.string().nullable().meta({
		description: "The entity ID for the schedule, or null when customer-level.",
	}),
	schedule_id: z.string().meta({
		description: "The ID of the created schedule.",
	}),
	phases: z.array(CreateScheduleResponsePhaseSchema).meta({
		description: "Persisted phases in ascending starts_at order.",
	}),
	invoice: BillingResponseSchema.shape.invoice,
	payment_url: BillingResponseSchema.shape.payment_url,
	required_action: BillingResponseRequiredActionSchema.optional(),
});

export type CreateScheduleResponse = z.infer<
	typeof CreateScheduleResponseSchema
>;
