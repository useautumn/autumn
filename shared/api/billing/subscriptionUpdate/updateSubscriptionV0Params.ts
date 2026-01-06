import { CreateFreeTrialSchema } from "@models/productModels/freeTrialModels/freeTrialModels";
import { z } from "zod/v4";
import { FeatureOptionsSchema } from "../../../models/cusProductModels/cusProductModels";
import { ProductItemSchema } from "../../../models/productV2Models/productItemModels/productItemModels";
import { CustomerDataSchema } from "../../common/customerData";
import { EntityDataSchema } from "../../models";

export const ExtUpdateSubscriptionV0ParamsSchema = z.object({
	// Customer / Entity Info
	customer_id: z.string(),
	product_id: z.string().nullish(),
	entity_id: z.string().nullish(),

	customer_data: CustomerDataSchema.optional(),
	entity_data: EntityDataSchema.optional(),

	options: z.array(FeatureOptionsSchema).nullish(), // used for update quantity etc (in api - feature_quantities)

	invoice: z.boolean().optional(),
	enable_product_immediately: z.boolean().optional(),
	finalize_invoice: z.boolean().optional(),

	// Schedules (epoch milliseconds)
	// plan_custom_start_date: z.number().optional(),
	// billing_cycle_anchor: z.number().optional(),

	// New
	items: z.array(ProductItemSchema).optional(), // used for custom configuration of a plan (in api - plan_override)
	free_trial: CreateFreeTrialSchema.nullable().optional(),

	reset_billing_cycle_anchor: z.boolean().optional(),
	new_billing_subscription: z.boolean().optional(),
	prorate_billing: z.boolean().optional(),
});

export const UpdateSubscriptionV0ParamsSchema =
	ExtUpdateSubscriptionV0ParamsSchema.extend({
		customer_product_id: z.string().optional(),
	});

export type ExtUpdateSubscriptionV0Params = z.infer<
	typeof ExtUpdateSubscriptionV0ParamsSchema
>;

export type UpdateSubscriptionV0Params = z.infer<
	typeof UpdateSubscriptionV0ParamsSchema
>;

// keep_existing_plan: true, //disable_plan_switch
// prorate_billing: true,
// invoice_only: true,

// carry_over_balance: true,
// reset_usage: true,

// billing_custom_start_date: "2025-11-04",
// billing_custom_end_date: "2025-12-04",
// billing_cycle_anchor: "2025-11-04",
// billing_due_date: "2025-11-04",

// new_billing_subscription: true, //fka combine_subscriptions, separate_billing_subscriptions
// require_payment_method: true, //fka force_checkout
// reset_balances: true

// plan_schedule: "immediate", // or "next_cycle", "custom_date"
// plan_custom_start_date: "2025-11-04",
// plan_custom_end_date: "2025-12-04",
// billing_schedule: "immediate", // or "next_cycle", "custom_date"
