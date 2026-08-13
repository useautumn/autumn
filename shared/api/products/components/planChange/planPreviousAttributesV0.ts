import { CustomerBillingControlsSchema } from "@models/cusModels/billingControls/customerBillingControls.js";
import type { z } from "zod/v4";
import { ApiPlanV1Schema } from "../../apiPlanV1.js";
import { ApiFreeTrialV2Schema } from "../apiFreeTrialV2.js";

/**
 * Sparse definition scalars that changed, holding their previous values.
 * Keys match `diffPlanV1PreviousAttributes`.
 */
export const PlanPreviousAttributesV0Schema = ApiPlanV1Schema.pick({
	id: true,
	name: true,
	description: true,
	group: true,
	add_on: true,
	auto_enable: true,
	config: true,
	archived: true,
	metadata: true,
})
	.partial()
	.extend({
		// Diff emits null when the previous value was unset so the key survives JSON.
		free_trial: ApiFreeTrialV2Schema.nullable().optional().meta({
			description:
				"Previous free trial when it changed. Null when the plan had none.",
		}),
		billing_controls: CustomerBillingControlsSchema.partial()
			.nullable()
			.optional()
			.meta({
				description:
					"Sparse previous billing_controls — only keys that changed. Null when unset.",
			}),
	});

export type PlanPreviousAttributesV0 = z.infer<
	typeof PlanPreviousAttributesV0Schema
>;
