import { z } from "zod/v4";
import {
	type AutumnBillingPlan,
	AutumnBillingPlanSchema,
	type DeferredAutumnBillingPlanData,
	type FreeTrialPlan,
	type InvoiceMode,
	InvoiceModeSchema,
} from "./autumnBillingPlan";
import {
	type StripeBillingPlan,
	StripeBillingPlanSchema,
	type StripeInvoiceAction,
	StripeInvoiceActionSchema,
	type StripeInvoiceItemsAction,
	StripeInvoiceItemsActionSchema,
	type StripeInvoiceMetadata,
	type StripeSubscriptionAction,
	StripeSubscriptionActionSchema,
	type StripeSubscriptionScheduleAction,
	StripeSubscriptionScheduleActionSchema,
} from "./stripeBillingPlan/stripeBillingPlan";

export {
	AutumnBillingPlanSchema,
	InvoiceModeSchema,
	StripeBillingPlanSchema,
	StripeInvoiceActionSchema,
	StripeInvoiceItemsActionSchema,
	StripeSubscriptionActionSchema,
	StripeSubscriptionScheduleActionSchema,
	type AutumnBillingPlan,
	type DeferredAutumnBillingPlanData,
	type FreeTrialPlan,
	type InvoiceMode,
	type StripeBillingPlan,
	type StripeInvoiceAction,
	type StripeInvoiceItemsAction,
	type StripeInvoiceMetadata,
	type StripeSubscriptionAction,
	type StripeSubscriptionScheduleAction,
};

export const BillingPlanSchema = z.object({
	autumn: AutumnBillingPlanSchema,
	stripe: StripeBillingPlanSchema,
});

export type BillingPlan = z.infer<typeof BillingPlanSchema>;
