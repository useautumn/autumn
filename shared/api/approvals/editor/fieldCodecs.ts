import { isPlainObject } from "../schemas/isPlainObject";
import type { EditorField, EditorRow } from "./editorFields";
import {
	type Filter,
	fromNumberMatcher,
	fromPlanFilter,
	fromStringMatcher,
	isEmptyObject,
	type RowRead,
	toMatcher,
	toPlanFilter,
} from "./filterParts";

/** How one field's rows are stored in a group's filter, and read back out of it. */
type FieldCodec = {
	toFilter: (row: EditorRow) => Filter;
	fromFilter: (group: Filter) => RowRead[];
};

/** `{ a: { b: leaf } }` from `["a", "b"]`. */
const at = (path: string[], leaf: unknown): Filter =>
	path.reduceRight<unknown>((inner, key) => ({ [key]: inner }), leaf) as Filter;

const get = (value: unknown, path: string[]) =>
	path.reduce<unknown>(
		(inner, key) => (isPlainObject(inner) ? inner[key] : undefined),
		value,
	);

const INCOMING_PLAN = ["incoming", "$every"];

const stringAt = (path: string[]): FieldCodec => ({
	toFilter: (row) => at(path, toMatcher(row)),
	fromFilter: (group) => fromStringMatcher(get(group, path)),
});

const numberAt = (path: string[]): FieldCodec => ({
	toFilter: (row) => at(path, toMatcher(row)),
	fromFilter: (group) => fromNumberMatcher(get(group, path)),
});

const booleanAt = (path: string[]): FieldCodec => ({
	toFilter: (row) => at(path, row.value),
	fromFilter: (group) => {
		const value = get(group, path);
		return typeof value === "boolean" ? [{ operator: "is", value }] : [];
	},
});

/** `starts_at` counts days back, `expires_at` days ahead. */
const daysAt = ({
	path,
	sign,
}: {
	path: string[];
	sign: 1 | -1;
}): FieldCodec => ({
	toFilter: (row) => at(path, sign * (row.value as number)),
	fromFilter: (group) => {
		const days = get(group, path);
		return typeof days === "number"
			? [{ operator: "is", value: sign * days }]
			: [];
	},
});

const CUSTOMER_PLAN = ["customer", "plan"];

const customerPlan: FieldCodec = {
	toFilter: (row) => {
		if (row.operator === "has") {
			return at([...CUSTOMER_PLAN, "$some"], toPlanFilter(row.value));
		}
		const none = row.operator === "has_none" ? {} : toPlanFilter(row.value);
		return at([...CUSTOMER_PLAN, "$none"], none);
	},
	fromFilter: (group) => {
		const has = fromPlanFilter(get(group, [...CUSTOMER_PLAN, "$some"]));
		const none = get(group, [...CUSTOMER_PLAN, "$none"]);
		const doesntHave = fromPlanFilter(none);
		return [
			...(has ? [{ operator: "has", value: has }] : []),
			...(isEmptyObject(none) ? [{ operator: "has_none", value: null }] : []),
			...(doesntHave ? [{ operator: "doesnt_have", value: doesntHave }] : []),
		];
	},
};

export const FIELD_CODECS: Record<EditorField, FieldCodec> = {
	customer: stringAt(["customer", "customer_id"]),
	customer_plan: customerPlan,
	paid: booleanAt(["paid"]),
	checkout: booleanAt(["checkout"]),
	total: numberAt(["total"]),
	incoming_paid: booleanAt([...INCOMING_PLAN, "paid"]),
	incoming_recurring: booleanAt([...INCOMING_PLAN, "recurring"]),
	incoming_addon: booleanAt([...INCOMING_PLAN, "addon"]),
	customized: booleanAt([...INCOMING_PLAN, "customized"]),
	discount: stringAt(["discounts", "$every", "reward_id"]),
	discount_percent_off: numberAt(["discounts", "$every", "percent_off"]),
	discount_amount_off: numberAt(["discounts", "$every", "amount_off"]),
	plan_schedule: stringAt(["plan_schedule"]),
	proration_behavior: stringAt(["proration_behavior"]),
	starts_at: daysAt({ path: ["starts_at", "$gte", "days_from_now"], sign: -1 }),
	invoice_mode: booleanAt(["invoice_mode", "enabled"]),
	cancel_action: stringAt(["cancel_action"]),
	feature: stringAt(["feature_id"]),
	included_grant: numberAt(["included_grant"]),
	unlimited: booleanAt(["unlimited"]),
	expires_at: daysAt({
		path: ["expires_at", "$lte", "days_from_now"],
		sign: 1,
	}),
	reset_interval: stringAt(["reset", "interval"]),
	add_to_balance: numberAt(["add_to_balance"]),
	remaining: numberAt(["remaining"]),
	usage: numberAt(["usage"]),
	reward: stringAt(["reward_id"]),
	plan: stringAt(["plan_id"]),
};
