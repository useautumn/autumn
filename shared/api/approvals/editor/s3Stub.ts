import { z } from "zod/v4";
import { arrayFilter } from "../../common/filters/arrayFilter";
import {
	BooleanMatcherSchema,
	enumMatcher,
	nullableObjectFilter,
} from "../../common/filters/matcher";
import { CustomerFilterSchema } from "../../migrations/filters/customerFilter";
import {
	balanceCreateWhenShape,
	balanceUpdateWhenShape,
} from "../schemas/when/balanceWhen";
import {
	billingCancelWhenShape,
	billingChangeWhenShape,
} from "../schemas/when/billingWhen";
import { buildWhenSchema, type WhenOf } from "../schemas/when/buildWhenSchema";
import {
	catalogFeatureWhenShape,
	catalogPlanWhenShape,
} from "../schemas/when/catalogWhen";
import { invoiceWhenShape } from "../schemas/when/invoiceWhen";
import { PlanChangeFilterSchema } from "../schemas/when/planChangeFilter";
import { rewardApplyWhenShape } from "../schemas/when/rewardWhen";
import { IdMatcherSchema } from "../schemas/when/whenFields";

// STUB for S3 #4987's rewrite, with the names pinned in the captain handoff: import from S3 instead once it freezes, then delete this file.

export type RuleEffect = "allow" | "block";

const DurationSchema = z.object({
	length: z.number().int().positive(),
	unit: z.enum(["day", "month", "year"]),
});

export const DurationMatcherSchema = z.object({
	$eq: DurationSchema.optional(),
	$lt: DurationSchema.optional(),
	$lte: DurationSchema.optional(),
	$gt: DurationSchema.optional(),
	$gte: DurationSchema.optional(),
});

const customer = z
	.intersection(
		CustomerFilterSchema,
		z.object({ has_paid: BooleanMatcherSchema.optional() }),
	)
	.optional();

const incoming = arrayFilter(
	z.intersection(
		PlanChangeFilterSchema,
		z.object({
			free_trial: nullableObjectFilter(
				z.object({ duration: DurationMatcherSchema.optional() }),
			).optional(),
		}),
	),
).optional();

const billingCancel = { ...billingCancelWhenShape, customer };

export const APPROVAL_FILTER_SHAPES = {
	billing_change: {
		...billingChangeWhenShape,
		customer,
		incoming,
		entity: nullableObjectFilter(
			z.object({ feature_id: IdMatcherSchema.optional() }),
		).optional(),
		billing_cycle_anchor: enumMatcher([
			"now",
			"unchanged",
			"custom",
		]).optional(),
	},
	billing_cancel: billingCancel,
	billing_uncancel: billingCancel,
	invoice: { ...invoiceWhenShape, customer },
	balance_create: { ...balanceCreateWhenShape, customer },
	balance_update: { ...balanceUpdateWhenShape, customer },
	reward_redeem: { ...rewardApplyWhenShape, customer },
	customer_change: { customer },
	plan: catalogPlanWhenShape,
	feature: catalogFeatureWhenShape,
};

export type ApprovalFilterKey = keyof typeof APPROVAL_FILTER_SHAPES;

export type ApprovalRuleFilter = {
	[Key in ApprovalFilterKey]: WhenOf<(typeof APPROVAL_FILTER_SHAPES)[Key]>;
}[ApprovalFilterKey];

export const buildApprovalFilterSchema = ({
	key,
}: {
	key: ApprovalFilterKey;
}) => buildWhenSchema({ shape: APPROVAL_FILTER_SHAPES[key] });
