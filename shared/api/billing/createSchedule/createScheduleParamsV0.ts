import { FeatureQuantityParamsV0Schema } from "@api/billing/common/featureQuantity/featureQuantityParamsV0";
import { InvoiceModeParamsSchema } from "@api/billing/common/invoiceModeParams";
import { RedirectModeSchema } from "@api/billing/common/redirectMode";
import { BasePriceParamsSchema } from "@api/products/components/basePrice/basePrice";
import { CreatePlanItemParamsV1Schema } from "@api/products/items/crud/createPlanItemParamsV1";
import { z } from "zod/v4";

const CreateScheduleCustomizePlanSchema = z
	.object({
		price: BasePriceParamsSchema.nullable().optional().meta({
			description:
				"Override the base price of the plan. Pass null to remove the base price.",
		}),
		items: z.array(CreatePlanItemParamsV1Schema).optional().meta({
			description: "Override the items in the plan.",
		}),
	})
	.strict()
	.refine(
		(customize) =>
			customize.items !== undefined || customize.price !== undefined,
		{
			message: "When using customize, either items or price must be provided",
		},
	);

export const CreateSchedulePlanSchema = z
	.object({
		plan_id: z.string().meta({
			description: "The ID of the plan to schedule in this phase.",
		}),
		feature_quantities: z.array(FeatureQuantityParamsV0Schema).optional().meta({
			description: "Optional prepaid feature quantities for this phase's plan.",
		}),
		version: z.number().optional().meta({
			description: "Optional explicit plan version to schedule.",
		}),
		customize: CreateScheduleCustomizePlanSchema.optional().meta({
			description:
				"Customize the plan to schedule. Can override the price, items, or both.",
		}),
		subscription_id: z.string().optional().meta({
			description:
				"Unsupported for create_schedule today. Requests that include this field will be rejected.",
		}),
	})
	.refine((plan) => plan.subscription_id === undefined, {
		message: "subscription_id is not supported for create_schedule",
		path: ["subscription_id"],
	});

export const CreateSchedulePhaseSchema = z.object({
	starts_at: z.number().meta({
		description: "When this phase should start, in epoch milliseconds.",
	}),
	plans: z.array(CreateSchedulePlanSchema).min(1).meta({
		description: "Plans to materialize for this phase.",
	}),
});

export const CreateScheduleParamsV0Schema = z
	.object({
		customer_id: z.string().meta({
			description: "The ID of the customer to create the schedule for.",
		}),
		entity_id: z.string().optional().meta({
			description: "Optional entity ID for an entity-scoped schedule.",
		}),
		phases: z
			.tuple([CreateSchedulePhaseSchema])
			.rest(CreateSchedulePhaseSchema)
			.meta({
				description: "Ordered phase definitions for the schedule.",
			}),
		invoice_mode: InvoiceModeParamsSchema.optional().meta({
			description:
				"Invoice mode creates a draft or open invoice and sends it to the customer, instead of charging their card immediately.",
		}),
		redirect_mode: RedirectModeSchema.default("if_required").meta({
			description:
				"Controls when to return a checkout URL. 'always' returns a URL even if payment succeeds, 'if_required' only when payment action is needed, 'never' disables redirects.",
		}),
	})
	.refine(
		(data) => {
			const sortedPhases = [...data.phases].sort(
				(a, b) => a.starts_at - b.starts_at,
			);

			for (let index = 1; index < sortedPhases.length; index++) {
				const previousPhase = sortedPhases[index - 1];
				const currentPhase = sortedPhases[index];

				if (
					previousPhase &&
					currentPhase?.starts_at <= previousPhase.starts_at
				) {
					return false;
				}
			}

			return true;
		},
		{
			message: "Phase starts_at values must be strictly increasing",
			path: ["phases"],
		},
	);

export type CreateScheduleParamsV0 = z.infer<
	typeof CreateScheduleParamsV0Schema
>;
export type CreateScheduleParamsV0Input = z.input<
	typeof CreateScheduleParamsV0Schema
>;
