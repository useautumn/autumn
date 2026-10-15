import type {
	EditorField,
	EditorOperator,
	EditorRow,
	EditorRowValue,
	PlanSelection,
	TrialDuration,
} from "@autumn/shared/api/approvals/editor/index";
import type { FilterRow } from "@/components/filters/types";
import { makePlanKey, parsePlanKey } from "@/lib/planSelectionKeys";

/** A When row as U1's filter builder holds it: every value is a string. */
export type RuleRow = FilterRow<EditorField, EditorOperator>;

type ValueKind = "id" | "plan" | "number" | "boolean" | "trial" | "quantity";

const KINDS: Record<EditorField, ValueKind> = {
	customer: "id",
	customer_plan: "plan",
	current_plan: "plan",
	paid: "boolean",
	checkout: "boolean",
	total: "number",
	next_cycle_total: "number",
	incoming_plan: "plan",
	outgoing_plan: "plan",
	incoming_paid: "boolean",
	incoming_recurring: "boolean",
	incoming_addon: "boolean",
	free_trial: "trial",
	trial_card_required: "boolean",
	trial_on_end: "id",
	feature_quantity: "quantity",
	customized: "boolean",
	discount: "id",
	discount_percent_off: "number",
	discount_amount_off: "number",
	plan_schedule: "id",
	proration_behavior: "id",
	starts_at: "number",
	invoice_mode: "boolean",
	cancel_action: "id",
	refund: "number",
	feature: "id",
	included_grant: "number",
	unlimited: "boolean",
	expires_at: "number",
	reset_interval: "id",
	add_to_balance: "number",
	remaining: "number",
	usage: "number",
	reward: "id",
	plan: "id",
};

const MANY: Partial<Record<EditorOperator, EditorOperator>> = {
	is: "is_any_of",
	is_not: "is_none_of",
};
const ONE: Partial<Record<EditorOperator, EditorOperator>> = {
	is_any_of: "is",
	is_none_of: "is_not",
};

export const DEFAULT_TRIAL_UNIT = "month";

export const kindOf = (field: EditorField) => KINDS[field];

const toNumber = (value: string | undefined) =>
	value === undefined || value.trim() === "" || Number.isNaN(Number(value))
		? null
		: Number(value);

const toPlan = (key: string): PlanSelection => {
	const { planId, version } = parsePlanKey(key);
	return version === undefined
		? { plan_id: planId }
		: { plan_id: planId, version };
};

const isMany = (operator: EditorOperator) => operator in ONE;

/** "is" ⇄ "is any of" as the value count crosses one, when the field offers both. */
export const fitOperatorToValues = ({
	row,
	operators,
}: {
	row: RuleRow;
	operators: readonly EditorOperator[];
}): RuleRow => {
	const swap = row.values.length > 1 ? MANY[row.operator] : ONE[row.operator];
	return swap && operators.includes(swap) ? { ...row, operator: swap } : row;
};

const decodeValue = ({ field, operator, values }: RuleRow): EditorRowValue => {
	if (operator === "has_none") return null;
	const [first, second] = values;
	switch (kindOf(field)) {
		case "id":
			if (isMany(operator)) return values.length > 0 ? values : null;
			return first ?? null;
		case "plan":
			if (isMany(operator))
				return values.length > 0 ? values.map(toPlan) : null;
			return first ? toPlan(first) : null;
		case "number":
			return toNumber(first);
		case "boolean":
			return first === "true";
		case "trial": {
			const length = toNumber(first);
			return length === null
				? null
				: {
						length,
						unit: (second || DEFAULT_TRIAL_UNIT) as TrialDuration["unit"],
					};
		}
		case "quantity": {
			const quantity = toNumber(second);
			return first && quantity !== null
				? { feature_id: first, quantity }
				: null;
		}
	}
};

const encodeValue = ({ field, value }: EditorRow): string[] => {
	if (value === null) return [];
	switch (kindOf(field)) {
		case "plan":
			return [value].flat().map((plan) => {
				const { plan_id, version } = plan as PlanSelection;
				return makePlanKey({ planId: plan_id, version });
			});
		case "trial": {
			const { length, unit } = value as TrialDuration;
			return [String(length), unit];
		}
		case "quantity": {
			const { feature_id, quantity } = value as {
				feature_id: string;
				quantity: number;
			};
			return [feature_id, String(quantity)];
		}
		default:
			return [value].flat().map(String);
	}
};

export const decodeRow = (row: RuleRow): EditorRow => ({
	field: row.field,
	operator: row.operator,
	value: decodeValue(row),
});

export const encodeRow = (row: EditorRow): RuleRow => ({
	field: row.field,
	operator: row.operator,
	values: encodeValue(row),
});
