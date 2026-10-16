import {
	EDITOR_FIELDS,
	type EditorField,
	type EditorOperator,
	type EditorRow,
	type EditorRowValue,
	type PlanSelection,
	type TrialDuration,
} from "@autumn/shared/api/approvals/editor/index";
import type { FilterRow } from "@/components/filters/types";
import { makePlanKey, parsePlanKey } from "@/lib/planSelectionKeys";

/** A When row as U1's filter builder holds it: every value is a string. */
export type RuleRow = FilterRow<EditorField, EditorOperator>;

// Fields whose input the operators alone don't tell apart.
const NAMED_INPUTS: Partial<Record<EditorField, string>> = {
	customer: "customer",
	discount: "reward",
	reward: "reward",
	feature: "feature",
	plan: "catalog_plan",
	discount_percent_off: "percent",
	starts_at: "days",
	expires_at: "days",
	free_trial: "trial",
	feature_quantity: "quantity",
};

const OPERATORS_BY_FIELD = new Map(
	Object.values(EDITOR_FIELDS).flatMap(
		(fields) => Object.entries(fields) as [EditorField, readonly string[]][],
	),
);

/** The U1 `valueInput` key a field renders, from S5's operators; enum fields use their own name. */
export const valueInputOf = (field: EditorField) => {
	const operators = OPERATORS_BY_FIELD.get(field) ?? [];
	if (NAMED_INPUTS[field]) return NAMED_INPUTS[field];
	if (field.endsWith("_plan")) return "plan";
	if (operators.includes("lt")) return "number";
	if (operators.length === 1) return "yes_no";
	return field;
};

const NUMBER_INPUTS = ["number", "percent", "days"];

const MANY: Partial<Record<EditorOperator, EditorOperator>> = {
	is: "is_any_of",
	is_not: "is_none_of",
};
const ONE: Partial<Record<EditorOperator, EditorOperator>> = {
	is_any_of: "is",
	is_none_of: "is_not",
};

export const DEFAULT_TRIAL_UNIT = "month";

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
	// S5 reads "doesn't have" back for one plan only, so the picker keeps the latest.
	if (row.operator === "doesnt_have" && row.values.length > 1) {
		return { ...row, values: row.values.slice(-1) };
	}
	const swap = row.values.length > 1 ? MANY[row.operator] : ONE[row.operator];
	return swap && operators.includes(swap) ? { ...row, operator: swap } : row;
};

const decodeValue = ({ field, operator, values }: RuleRow): EditorRowValue => {
	if (operator === "has_none") return null;
	const [first, second] = values;
	const input = valueInputOf(field);
	if (NUMBER_INPUTS.includes(input)) return toNumber(first);
	switch (input) {
		case "plan":
			// "has" takes several plans too ("has any of"); S5 stores them as one `$in`.
			if (isMany(operator) || values.length > 1)
				return values.length > 0 ? values.map(toPlan) : null;
			return first ? toPlan(first) : null;
		case "yes_no":
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
		default:
			if (isMany(operator)) return values.length > 0 ? values : null;
			return first ?? null;
	}
};

const encodeValue = ({ field, value }: EditorRow): string[] => {
	if (value === null) return [];
	switch (valueInputOf(field)) {
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
