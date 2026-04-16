import { z } from "zod/v4";

export const ApiCustomerSchedulePhaseSchema = z.object({
	id: z.string().meta({
		description: "The persisted phase ID.",
	}),
	starts_at: z.number().meta({
		description: "When this phase starts, in epoch milliseconds.",
	}),
	customer_product_ids: z.array(z.string()).meta({
		description: "Customer products materialized for this phase.",
	}),
	created_at: z.number().meta({
		description: "Timestamp of phase creation in milliseconds since epoch.",
	}),
});

export const ApiCustomerScheduleSchema = z.object({
	id: z.string().meta({
		description: "The persisted schedule ID.",
	}),
	customer_id: z.string().meta({
		description: "The customer ID this schedule belongs to.",
	}),
	entity_id: z.string().nullable().meta({
		description: "The entity ID this schedule belongs to, or null.",
	}),
	created_at: z.number().meta({
		description: "Timestamp of schedule creation in milliseconds since epoch.",
	}),
	phases: z.array(ApiCustomerSchedulePhaseSchema).meta({
		description: "Persisted phases in ascending starts_at order.",
	}),
});

export type ApiCustomerSchedule = z.infer<typeof ApiCustomerScheduleSchema>;
