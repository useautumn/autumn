import { z } from "zod/v4";
import {
	type StripeBillingPlan,
	StripeBillingPlanSchema,
	type StripeCheckoutSessionAction,
	type StripeInvoiceAction,
	type StripeInvoiceItemsAction,
	type StripeInvoiceMetadata,
	type StripeSubscriptionAction,
	type StripeSubscriptionScheduleAction,
} from "../stripe/stripeBillingPlan";
import {
	type AutumnBillingPlan,
	AutumnBillingPlanSchema,
	type DeferredAutumnBillingPlanData,
	type DeferredSetupPaymentData,
} from "./autumnBillingPlan";

export type {
	AutumnBillingPlan,
	DeferredAutumnBillingPlanData,
	DeferredSetupPaymentData,
	StripeBillingPlan,
	StripeCheckoutSessionAction,
	StripeInvoiceAction,
	StripeInvoiceItemsAction,
	StripeInvoiceMetadata,
	StripeSubscriptionAction,
	StripeSubscriptionScheduleAction,
};

export const BillingPlanSchema = z.object({
	autumn: AutumnBillingPlanSchema,
	stripe: StripeBillingPlanSchema,
});

export type BillingPlan = z.infer<typeof BillingPlanSchema>;
