import { z } from "zod/v4";
import { PlanTimingSchema } from "../../../models/billingModels/context/attachBillingContext";
import { ProductItemSchema } from "../../../models/productV2Models/productItemModels/productItemModels";
import { BillingBehaviorSchema } from "../common/billingBehavior";
import { BillingCycleAnchorSchema } from "../common/billingCycleAnchor";
import { BillingParamsBaseV0Schema } from "../common/billingParamsBase/billingParamsBaseV0";
import { AttachDiscountSchema } from "./attachDiscount";

export const ExtAttachParamsV0Schema = BillingParamsBaseV0Schema.extend({
    // Product identification
    product_id: z.string(),

    // Invoice mode
    invoice: z.boolean().optional(),
    enable_product_immediately: z.boolean().optional(),
    finalize_invoice: z.boolean().optional(),

    success_url: z.string().optional(),

	new_billing_subscription: z.boolean().optional(),
	billing_cycle_anchor: BillingCycleAnchorSchema.optional(),

    plan_schedule: PlanTimingSchema.optional(),
    start_date: z.number().optional(),

    // Discounts to apply (Stripe coupon IDs or human-readable promo code strings)
    discounts: z.array(AttachDiscountSchema).optional(),
    // Billing behavior for attach operations (product transitions):
    // - 'prorate_immediately' (default): Invoice line items are charged immediately
    // - 'next_cycle_only': Do NOT create any charges due to the attach
    billing_behavior: BillingBehaviorSchema.optional(),

    // For importing an existing subscription...?
    processor_subscription_id: z.string().optional(),
    no_billing_changes: z.boolean().optional(),
});

export const AttachParamsV0Schema = ExtAttachParamsV0Schema.extend({
    // Custom product configuration
    items: z.array(ProductItemSchema).optional(),

    checkout_session_params: z.record(z.string(), z.unknown()).optional(),

    carry_over_balances: z
        .object({
            enabled: z.boolean(),
            feature_ids: z.array(z.string()).optional(),
        })
        .optional(),

    carry_over_usages: z
        .object({
            enabled: z.boolean(),
            feature_ids: z.array(z.string()).optional(),
        })
        .optional(),
});

export type ExtAttachParamsV0 = z.input<typeof ExtAttachParamsV0Schema>;
export type AttachParamsV0 = z.infer<typeof AttachParamsV0Schema>;
export type AttachParamsV0Input = z.input<typeof AttachParamsV0Schema>;
