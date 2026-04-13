import { CustomizePlanV1Schema } from "@api/billing/common/customizePlan/customizePlanV1";
import { FeatureQuantityParamsV0Schema } from "@api/billing/common/featureQuantity/featureQuantityParamsV0";
import { z } from "zod/v4";

export const CreateSchedulePlanSchema = z.object({
	plan_id: z.string().meta({
		description: "The ID of the plan to schedule in this phase.",
	}),
	feature_quantities: z.array(FeatureQuantityParamsV0Schema).optional().meta({
		description: "Optional prepaid feature quantities for this phase's plan.",
	}),
	version: z.number().optional().meta({
		description: "Optional explicit plan version to schedule.",
	}),
	customize: CustomizePlanV1Schema.optional().meta({
		description:
			"Customize the plan to schedule. Can override the price, items, free trial, or a combination.",
	}),
	subscription_id: z.string().optional().meta({
		description:
			"Unsupported for create_schedule today. Requests that include this field will be rejected.",
	}),
});

export const CreateSchedulePhaseSchema = z.object({
	starts_at: z.number().meta({
		description: "When this phase should start, in epoch milliseconds.",
	}),
	plans: z.array(CreateSchedulePlanSchema).min(1).meta({
		description: "Plans to materialize for this phase.",
	}),
});

export const CreateScheduleParamsV0Schema = z.object({
	customer_id: z.string().meta({
		description: "The ID of the customer to create the schedule for.",
	}),
	entity_id: z.string().optional().meta({
		description: "Optional entity ID for an entity-scoped schedule.",
	}),
	phases: z.array(CreateSchedulePhaseSchema).min(1).meta({
		description: "Ordered phase definitions for the schedule.",
	}),
});

export type CreateScheduleParamsV0 = z.infer<
	typeof CreateScheduleParamsV0Schema
>;
export type CreateScheduleParamsV0Input = z.input<
	typeof CreateScheduleParamsV0Schema
>;
