import { FeatureQuantityParamsV0Schema } from "@api/billing/common/featureQuantity/featureQuantityParamsV0";
import { FreeTrialParamsV1Schema } from "@api/common/freeTrial/freeTrialParamsV1";
import { BasePriceParamsSchema } from "@api/products/components/basePrice/basePrice";
import { CreatePlanItemParamsV1Schema } from "@api/products/items/crud/createPlanItemParamsV1";
import { z } from "zod/v4";
import { CustomerDataSchema } from "../../common/customerData";
import { EntityDataSchema } from "../../common/entityData";
import { InvoiceModeParamsSchema } from "../common/invoiceModeParams";
import { RedirectModeSchema } from "../common/redirectMode";
import { AttachDiscountSchema } from "./attachDiscount";

/** Per-plan customize without free_trial */
const MultiAttachCustomizePlanSchema = z
	.object({
		price: BasePriceParamsSchema.nullable().optional().meta({
			description:
				"Override the base price of the plan. Pass null to remove the base price.",
		}),
		items: z.array(CreatePlanItemParamsV1Schema).optional().meta({
			description: "Override the items in the plan.",
		}),
	})
	.optional();

/** Per-plan entry in the multi-attach request */
export const MultiAttachPlanSchema = z.object({
	plan_id: z.string().meta({
		description: "The ID of the plan to attach.",
	}),
	customize: MultiAttachCustomizePlanSchema.meta({
		description:
			"Customize the plan to attach. Can override the price or items.",
	}),
	feature_quantities: z.array(FeatureQuantityParamsV0Schema).optional().meta({
		description:
			"If this plan contains prepaid features, use this field to specify the quantity of each prepaid feature.",
	}),
	version: z.number().optional().meta({
		description: "The version of the plan to attach.",
	}),
});

export const MultiAttachParamsV0Schema = z.object({
	customer_id: z.string().meta({
		description: "The ID of the customer to attach the plans to.",
	}),
	entity_id: z.string().optional().meta({
		description: "The ID of the entity to attach the plans to.",
	}),

	plans: z
		.array(MultiAttachPlanSchema)
		.min(1, "At least one plan must be provided")
		.meta({
			description: "The list of plans to attach to the customer.",
		}),

	free_trial: FreeTrialParamsV1Schema.nullable().optional().meta({
		description:
			"Free trial configuration applied to all plans. Pass an object to set a custom trial, or null to remove any trial.",
	}),

	invoice_mode: InvoiceModeParamsSchema.optional().meta({
		description:
			"Invoice mode creates a draft or open invoice and sends it to the customer, instead of charging their card immediately.",
	}),

	discounts: z.array(AttachDiscountSchema).optional().meta({
		description:
			"List of discounts to apply. Each discount can be an Autumn reward ID, Stripe coupon ID, or Stripe promotion code.",
	}),

	success_url: z.string().optional().meta({
		description: "URL to redirect to after successful checkout.",
	}),

	checkout_session_params: z.record(z.string(), z.unknown()).optional().meta({
		description:
			"Additional parameters to pass into the creation of the Stripe checkout session.",
	}),

	redirect_mode: RedirectModeSchema.default("if_required").meta({
		description:
			"Controls when to return a checkout URL. 'always' returns a URL even if payment succeeds, 'if_required' only when payment action is needed, 'never' disables redirects.",
	}),

	// Internal
	customer_data: CustomerDataSchema.optional().meta({
		internal: true,
	}),
	entity_data: EntityDataSchema.optional().meta({
		internal: true,
	}),
});

export type MultiAttachParamsV0 = z.infer<typeof MultiAttachParamsV0Schema>;
