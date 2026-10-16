import { z } from "zod/v4";
import { arrayFilter } from "../../../common/filters/arrayFilter";
import {
	BooleanMatcherSchema,
	enumMatcher,
	NumberMatcherSchema,
	nullableObjectFilter,
} from "../../../common/filters/matcher";
import { buildFilterSchema, type FilterOf } from "./buildFilterSchema";
import {
	IdMatcherSchema,
	MoneyMatcherSchema,
	RelativeDateMatcherSchema,
	sharedFilterFields,
} from "./filterFields";
import { PlanChangeFilterSchema } from "./planChangeFilter";

/** Attach, update, set plans, create schedule: billing preview fields plus request params. */
export const billingChangeFilterShape = {
	customer: sharedFilterFields.customer,
	entity: sharedFilterFields.entity,
	incoming: arrayFilter(PlanChangeFilterSchema).optional(),
	outgoing: sharedFilterFields.outgoing,
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
	/** `now` resets the cycle, `custom` sets a date, `unchanged` leaves it alone. */
	billing_cycle_anchor: enumMatcher(["now", "unchanged", "custom"]).optional(),
	starts_at: RelativeDateMatcherSchema.optional(),
	invoice_mode: nullableObjectFilter(
		z.object({ enabled: BooleanMatcherSchema.optional() }),
	).optional(),
};

export const BillingChangeFilterSchema = buildFilterSchema({
	shape: billingChangeFilterShape,
});
export type BillingChangeFilter = FilterOf<typeof billingChangeFilterShape>;

/** Cancel: `billing.update` with a cancel action. */
export const billingCancelFilterShape = {
	customer: sharedFilterFields.customer,
	entity: sharedFilterFields.entity,
	cancel_action: enumMatcher([
		"cancel_end_of_cycle",
		"cancel_immediately",
	]).optional(),
	/** The plan being cancelled. */
	outgoing: sharedFilterFields.outgoing,
	refund: sharedFilterFields.refund,
};

export const BillingCancelFilterSchema = buildFilterSchema({
	shape: billingCancelFilterShape,
});
export type BillingCancelFilter = FilterOf<typeof billingCancelFilterShape>;

/** Uncancel has no timing or refund, only the plan being restored. */
export const billingUncancelFilterShape = {
	customer: sharedFilterFields.customer,
	entity: sharedFilterFields.entity,
	outgoing: sharedFilterFields.outgoing,
};

export const BillingUncancelFilterSchema = buildFilterSchema({
	shape: billingUncancelFilterShape,
});
export type BillingUncancelFilter = FilterOf<typeof billingUncancelFilterShape>;
