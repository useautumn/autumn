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
import { decodeRow, encodeRow, valueInputOf } from "./ruleRowCodec";

// Dot paths into S3's WHEN_FIELD_LABELS where they aren't the field's own name.
const LABEL_PATHS: Partial<Record<EditorField, string>> = {
	customer: "customer.customer_id",
	customer_plan: "customer.plan",
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
	invoice_mode: "invoice_mode.enabled",
	refund: "refund.amount",
	feature: "feature_id",
	reset_interval: "reset.interval",
	reward: "reward_id",
	plan: "plan_id",
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

export const fieldLabel = ({
	area,
	field,
}: {
	area: WhenKey;
	field: EditorField;
}) => {
	const labels: Record<string, string> = WHEN_FIELD_LABELS[area];
	// S3 has no "Current plan"; it shares `customer.plan` with "Customer has plan".
	if (field === "current_plan") return "Current plan";
	return labels[LABEL_PATHS[field] ?? field] ?? field;
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
			valueInput: valueInputOf(field),
			operators: operatorOptions(operators),
			toFilter: decodeRow,
			fromFilter: (row) => (row.field === field ? encodeRow(row) : null),
		})),
	});
};

export type RuleFieldRegistry = ReturnType<typeof ruleFieldRegistry>;
