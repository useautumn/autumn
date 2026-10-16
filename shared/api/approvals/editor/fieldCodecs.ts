import type { ApprovalRuleEffect as RuleEffect } from "../schemas/approvalRule";
import { isPlainObject } from "../schemas/isPlainObject";
import type { EditorField, EditorRow } from "./editorFields";
import {
	at,
	type Filter,
	fromNumberMatcher,
	fromPlanFilter,
	fromStringMatcher,
	get,
	isEmptyObject,
	type RowRead,
	toMatcher,
	toPlanFilter,
} from "./filterParts";

/** How one field's rows are stored in a group's filter, and read back out of it. */
type FieldCodec = {
	/** Null when the row's value can't be stored. */
	toFilter: (input: { row: EditorRow; effect: RuleEffect }) => Filter | null;
	fromFilter: (input: { group: Filter; effect: RuleEffect }) => RowRead[];
};

/** Stands for the array quantifier the effect picks; see `resolve`. */
const EACH = "$each";

/**
 * A block rule matches when some element is this (`$some`); an allow rule
 * only covers the request when every element is (`$every`).
 */
const resolve = ({ path, effect }: { path: string[]; effect: RuleEffect }) =>
	path.map((key) =>
		key === EACH ? (effect === "block" ? "$some" : "$every") : key,
	);

const INCOMING_PLAN = ["incoming", EACH];
const DISCOUNT = ["discounts", EACH];

const stringAt = (path: string[]): FieldCodec => ({
	toFilter: ({ row, effect }) => at(resolve({ path, effect }), toMatcher(row)),
	fromFilter: ({ group, effect }) =>
		fromStringMatcher(get(group, resolve({ path, effect }))),
});

const numberAt = (path: string[]): FieldCodec => ({
	toFilter: ({ row, effect }) => at(resolve({ path, effect }), toMatcher(row)),
	fromFilter: ({ group, effect }) =>
		fromNumberMatcher(get(group, resolve({ path, effect }))),
});

const booleanAt = (path: string[]): FieldCodec => ({
	toFilter: ({ row, effect }) => at(resolve({ path, effect }), row.value),
	fromFilter: ({ group, effect }) => {
		const value = get(group, resolve({ path, effect }));
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
	toFilter: ({ row }) =>
		typeof row.value === "number" ? at(path, sign * row.value) : null,
	fromFilter: ({ group }) => {
		const days = get(group, path);
		return typeof days === "number"
			? [{ operator: "is", value: sign * days }]
			: [];
	},
});

const CUSTOMER_PLAN = ["customer", "plan"];

const customerPlan: FieldCodec = {
	toFilter: ({ row }) => {
		if (row.operator === "has_none") return at([...CUSTOMER_PLAN, "$none"], {});
		const plan = toPlanFilter(row.value);
		const quantifier = row.operator === "has" ? "$some" : "$none";
		return plan && at([...CUSTOMER_PLAN, quantifier], plan);
	},
	fromFilter: ({ group }) => {
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

const ENTITY_TYPE_MATCHERS: Record<string, string> = {
	is_any_of: "$in",
	is_none_of: "$nin",
};

/** Where the change lands: the customer (`null`), any entity, or entities of some types. */
const entity: FieldCodec = {
	toFilter: ({ row }) => {
		if (row.operator === "is_customer") return { entity: null };
		if (row.operator === "is_entity") return { entity: { $ne: null } };
		const matcher = ENTITY_TYPE_MATCHERS[row.operator];
		return matcher ? at(["entity", "feature_id", matcher], row.value) : null;
	},
	fromFilter: ({ group }) => {
		const value = group.entity;
		if (value === null) return [{ operator: "is_customer", value: null }];
		if (isPlainObject(value) && value.$ne === null)
			return [{ operator: "is_entity", value: null }];
		return fromStringMatcher(get(value, ["feature_id"]));
	},
};

export const FIELD_CODECS: Record<EditorField, FieldCodec> = {
	customer: stringAt(["customer", "customer_id"]),
	customer_plan: customerPlan,
	customer_has_paid: booleanAt(["customer", "has_paid"]),
	entity,
	paid: booleanAt(["paid"]),
	checkout: booleanAt(["checkout"]),
	total: numberAt(["total"]),
	incoming_paid: booleanAt([...INCOMING_PLAN, "paid"]),
	incoming_recurring: booleanAt([...INCOMING_PLAN, "recurring"]),
	incoming_addon: booleanAt([...INCOMING_PLAN, "addon"]),
	customized: booleanAt([...INCOMING_PLAN, "customized"]),
	discount: stringAt([...DISCOUNT, "reward_id"]),
	discount_percent_off: numberAt([...DISCOUNT, "percent_off"]),
	discount_amount_off: numberAt([...DISCOUNT, "amount_off"]),
	plan_schedule: stringAt(["plan_schedule"]),
	proration_behavior: stringAt(["proration_behavior"]),
	billing_cycle_anchor: stringAt(["billing_cycle_anchor"]),
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
