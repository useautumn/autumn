import { arrayFilter } from "@api/common/filters/arrayFilter";
import {
	BooleanMatcherSchema,
	enumMatcher,
	NumberMatcherSchema,
	nullableObjectFilter,
} from "@api/common/filters/matcher";
import { z } from "zod/v4";
import { buildWhenSchema, type WhenOf } from "./buildWhenSchema";
import { PlanChangeFilterSchema } from "./planChangeFilter";
import {
	IdMatcherSchema,
	MoneyMatcherSchema,
	RelativeDateMatcherSchema,
	sharedWhenFields,
} from "./whenFields";

/** Attach, update subscription, set plans, schedule: billing preview fields plus request params. */
export const billingChangeWhenShape = {
	customer: sharedWhenFields.customer,
	incoming: arrayFilter(PlanChangeFilterSchema).optional(),
	outgoing: sharedWhenFields.outgoing,
	/** Charges the customer now or later (derived from the billing plan). */
	paid: BooleanMatcherSchema.optional(),
	/** The attach returns a checkout URL. */
	checkout: BooleanMatcherSchema.optional(),
	total: MoneyMatcherSchema.optional(),
	next_cycle: nullableObjectFilter(
		z.object({ total: MoneyMatcherSchema.optional() }),
	).optional(),
	discounts: arrayFilter(
		z.object({
			reward_id: IdMatcherSchema.optional(),
			percent_off: NumberMatcherSchema.optional(),
			amount_off: MoneyMatcherSchema.optional(),
		}),
	).optional(),
	plan_schedule: enumMatcher(["immediate", "end_of_cycle"]).optional(),
	proration_behavior: enumMatcher([
		"prorate_immediately",
		"none",
		"bill_difference",
	]).optional(),
	starts_at: RelativeDateMatcherSchema.optional(),
	invoice_mode: nullableObjectFilter(
		z.object({ enabled: BooleanMatcherSchema.optional() }),
	).optional(),
};

export const BillingChangeWhenSchema = buildWhenSchema({
	shape: billingChangeWhenShape,
});
export type BillingChangeWhen = WhenOf<typeof billingChangeWhenShape>;

/** Cancel, uncancel. */
export const billingCancelWhenShape = {
	customer: sharedWhenFields.customer,
	cancel_action: enumMatcher([
		"cancel_end_of_cycle",
		"cancel_immediately",
	]).optional(),
	/** The plan being cancelled. */
	outgoing: sharedWhenFields.outgoing,
	refund: sharedWhenFields.refund,
};

export const BillingCancelWhenSchema = buildWhenSchema({
	shape: billingCancelWhenShape,
});
export type BillingCancelWhen = WhenOf<typeof billingCancelWhenShape>;
