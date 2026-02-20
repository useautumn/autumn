import { FeatureQuantityParamsV0Schema } from "@api/billing/common/featureQuantity/featureQuantityParamsV0";
import { z } from "zod/v4";
import { CustomerDataSchema } from "../../../common/customerData";
import { EntityDataSchema } from "../../../common/entityData";
import { BillingBehaviorSchema } from "../billingBehavior";
import { CustomizePlanV1Schema } from "../customizePlan/customizePlanV1";
import { InvoiceModeParamsSchema } from "../invoiceModeParams";
import { TransitionRulesSchema } from "../transitionRules";

export const BillingParamsBaseV1Schema = z.object({
	customer_id: z.string().meta({
		description: "The ID of the customer to attach the plan to.",
	}),
	entity_id: z.string().optional().meta({
		description: "The ID of the entity to attach the plan to.",
	}),
	plan_id: z.string().meta({
		description: "The ID of the plan.",
	}),

	feature_quantities: z.array(FeatureQuantityParamsV0Schema).optional().meta({
		description:
			"If this plan contains prepaid features, use this field to specify the quantity of each prepaid feature. This quantity includes the included amount and billing units defined when setting up the plan.",
	}),
	version: z.number().optional().meta({
		description: "The version of the plan to attach.",
	}),
	customize: CustomizePlanV1Schema.optional().meta({
		description:
			"Customize the plan to attach. Can override the price, items, free trial, or a combination.",
	}),

	invoice_mode: InvoiceModeParamsSchema.optional().meta({
		description:
			"Invoice mode creates a draft or open invoice and sends it to the customer, instead of charging their card immediately. This uses Stripe's send_invoice collection method.",
	}),
	proration_behavior: BillingBehaviorSchema.optional().meta({
		description:
			"How to handle proration when updating an existing subscription. 'prorate_immediately' charges/credits prorated amounts now, 'none' skips creating any charges.",
	}),

	transition_rules: TransitionRulesSchema.optional().meta({
		internal: true,
	}),

	// Internal
	customer_data: CustomerDataSchema.optional().meta({
		internal: true,
	}),
	entity_data: EntityDataSchema.optional().meta({
		internal: true,
	}),
});

export type BillingParamsBaseV1 = z.infer<typeof BillingParamsBaseV1Schema>;
