import { WHEN_FIELD_LABELS, type WhenKey } from "@autumn/shared";
import {
	EDITOR_FIELDS,
	type EditorField,
	type EditorOperator,
	type EditorRow,
	PINNED_FIELDS,
} from "@autumn/shared/api/approvals/editor/index";
import { createFieldRegistry } from "@/components/filters/fieldRegistry";
import type { FilterOperatorOption } from "@/components/filters/types";
import { decodeRow, encodeRow, kindOf } from "./ruleRowCodec";

// Each editor field's dot path in S3's WHEN_FIELD_LABELS, the one label source.
const LABEL_PATHS: Record<EditorField, string> = {
	customer: "customer.customer_id",
	customer_plan: "customer.plan",
	current_plan: "customer.plan",
	paid: "paid",
	checkout: "checkout",
	total: "total",
	next_cycle_total: "next_cycle.total",
	incoming_plan: "incoming.plan_id",
	outgoing_plan: "outgoing.plan_id",
	incoming_paid: "incoming.paid",
	incoming_recurring: "incoming.recurring",
	incoming_addon: "incoming.addon",
	free_trial: "incoming.free_trial",
	trial_card_required: "incoming.free_trial.card_required",
	trial_on_end: "incoming.free_trial.on_end",
	feature_quantity: "incoming.feature_quantities",
	customized: "incoming.customized",
	discount: "discounts.reward_id",
	discount_percent_off: "discounts.percent_off",
	discount_amount_off: "discounts.amount_off",
	plan_schedule: "plan_schedule",
	proration_behavior: "proration_behavior",
	starts_at: "starts_at",
	invoice_mode: "invoice_mode.enabled",
	cancel_action: "cancel_action",
	refund: "refund.amount",
	feature: "feature_id",
	included_grant: "included_grant",
	unlimited: "unlimited",
	expires_at: "expires_at",
	reset_interval: "reset.interval",
	add_to_balance: "add_to_balance",
	remaining: "remaining",
	usage: "usage",
	reward: "reward_id",
	plan: "plan_id",
};

// S3 has no label for "Current plan"; it shares `customer.plan` with "Customer has plan".
const UNLABELLED: Partial<Record<EditorField, string>> = {
	current_plan: "Current plan",
};

const OPERATOR_LABELS: Record<EditorOperator, string> = {
	is: "is",
	is_not: "is not",
	is_any_of: "is any of",
	is_none_of: "is none of",
	has: "has",
	doesnt_have: "doesn't have",
	has_none: "has none",
	eq: "equals",
	ne: "doesn't equal",
	lt: "less than",
	lte: "at most",
	gt: "more than",
	gte: "at least",
};

// Value inputs by key; ids with fixed choices use the field name as their key.
const INPUTS: Partial<Record<EditorField, string>> = {
	customer: "customer",
	discount: "reward",
	reward: "reward",
	feature: "feature",
	plan: "catalog_plan",
	discount_percent_off: "percent",
	starts_at: "days",
	expires_at: "days",
};

const valueInputFor = (field: EditorField) => {
	const input = INPUTS[field];
	if (input) return input;
	const kind = kindOf(field);
	if (kind === "boolean") return "yes_no";
	return kind === "id" ? field : kind;
};

export const fieldLabel = ({
	area,
	field,
}: {
	area: WhenKey;
	field: EditorField;
}) => {
	const labels: Record<string, string> = WHEN_FIELD_LABELS[area];
	return UNLABELLED[field] ?? labels[LABEL_PATHS[field]] ?? field;
};

export const operatorOptions = (
	operators: readonly EditorOperator[],
): FilterOperatorOption<EditorOperator>[] =>
	operators.map((operator) => ({
		value: operator,
		label: OPERATOR_LABELS[operator],
		hidesValue: operator === "has_none",
	}));

/** The area's When fields for U1's builder, in board order; the pinned Feature isn't one. */
export const ruleFieldRegistry = ({ area }: { area: WhenKey }) => {
	const fields = Object.entries(EDITOR_FIELDS[area]) as [
		EditorField,
		readonly EditorOperator[],
	][];
	const groupFields = fields.filter(([field]) => field !== PINNED_FIELDS[area]);

	return createFieldRegistry<EditorRow, EditorField, EditorOperator>({
		defaultPath: groupFields[0][0],
		fields: groupFields.map(([field, operators]) => ({
			path: field,
			label: fieldLabel({ area, field }),
			valueInput: valueInputFor(field),
			operators: operatorOptions(operators),
			toFilter: decodeRow,
			fromFilter: (row) => (row.field === field ? encodeRow(row) : null),
		})),
	});
};

export type RuleFieldRegistry = ReturnType<typeof ruleFieldRegistry>;
