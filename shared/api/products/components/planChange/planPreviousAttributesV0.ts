import { CustomerBillingControlsSchema } from "@models/cusModels/billingControls/customerBillingControls.js";
import { z } from "zod/v4";
import { ApiPlanV1Schema } from "../../apiPlanV1.js";
import { ApiFreeTrialV2Schema } from "../apiFreeTrialV2.js";
import { ApiPlanProcessorsSchema } from "../processors.js";

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
	processors: true,
})
	.partial()
	.extend({
		// Diff emits null when the previous value was unset so the key survives JSON;
		// a create has every previous value unset, so each scalar admits null too.
		id: ApiPlanV1Schema.shape.id.nullable().optional(),
		name: ApiPlanV1Schema.shape.name.nullable().optional(),
		description: ApiPlanV1Schema.shape.description.nullable().optional(),
		group: ApiPlanV1Schema.shape.group.nullable().optional(),
		add_on: ApiPlanV1Schema.shape.add_on.nullable().optional(),
		auto_enable: ApiPlanV1Schema.shape.auto_enable.nullable().optional(),
		config: ApiPlanV1Schema.shape.config.nullable().optional(),
		archived: ApiPlanV1Schema.shape.archived.nullable().optional(),
		metadata: ApiPlanV1Schema.shape.metadata.nullable().optional(),
		processors: ApiPlanProcessorsSchema.nullable().optional().meta({
			description:
				"Previous payment processors when they changed. Null when the plan had none.",
		}),
		free_trial: ApiFreeTrialV2Schema.nullable().optional().meta({
			description:
				"Previous free trial when it changed. Null when the plan had none.",
		}),
		// Each lane admits null too: a lane that was unset and is now set reads as added.
		billing_controls: z
			.object(
				Object.fromEntries(
					Object.entries(CustomerBillingControlsSchema.shape).map(
						([lane, schema]) => [lane, schema.nullable().optional()],
					),
				),
			)
			.nullable()
			.optional()
			.meta({
				description:
					"Sparse previous billing_controls — only keys that changed. Null when unset; a null lane was unset before.",
			}),
	});

export type PlanPreviousAttributesV0 = z.infer<
	typeof PlanPreviousAttributesV0Schema
>;
