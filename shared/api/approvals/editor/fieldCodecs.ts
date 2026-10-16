import type { DurationBound } from "../../common/filters/durationMatcher";
import type { ApprovalRuleEffect as RuleEffect } from "../schemas/approvalRule";
import { isPlainObject } from "../schemas/isPlainObject";
import type { EditorField, EditorRow, FeatureQuantity } from "./editorFields";
import {
	at,
	entriesOf,
	type Filter,
	fromNumberMatcher,
	fromPlanFilter,
	fromStringMatcher,
	get,
	isCapOperator,
	isEmptyObject,
	NEGATED_NUMBER_OPERATORS,
	planSelectionsOf,
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

const planReads = ({
	filter,
	negative,
}: {
	filter: unknown;
	negative: boolean;
}) => {
	const [single, many] = negative
		? ["is_not", "is_none_of"]
		: ["is", "is_any_of"];
	return planSelectionsOf(filter).map((selection) => ({
		operator: Array.isArray(selection) ? many : single,
		value: selection,
	}));
};

const isNegativePlanOperator = (operator: string) =>
	operator === "is_not" || operator === "is_none_of";

/** "Is" follows the effect's quantifier; "is not" is `$none` under both. */
const plansAt = (path: string[]): FieldCodec => ({
	toFilter: ({ row, effect }) => {
		const quantifier = isNegativePlanOperator(row.operator) ? "$none" : EACH;
		const plans = toPlanFilter(row.value);
		return plans && at(resolve({ path: [...path, quantifier], effect }), plans);
	},
	fromFilter: ({ group, effect }) => [
		...planReads({
			filter: get(group, resolve({ path: [...path, EACH], effect })),
			negative: false,
		}),
		...planReads({ filter: get(group, [...path, "$none"]), negative: true }),
	],
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
			...(doesntHave && !Array.isArray(doesntHave)
				? [{ operator: "doesnt_have", value: doesntHave }]
				: []),
		];
	},
};

const currentPlans = plansAt(CUSTOMER_PLAN);

// Customer has plan reads what it stores the same way: "is not" always, and "is" under block (`$some`).
const currentPlan: FieldCodec = {
	toFilter: currentPlans.toFilter,
	fromFilter: (input) =>
		currentPlans
			.fromFilter(input)
			.filter(
				({ operator }) =>
					operator !== "is_not" &&
					!(input.effect === "block" && !isNegativePlanOperator(operator)),
			),
};

const FREE_TRIAL = [...INCOMING_PLAN, "free_trial"];

const TRIAL_UNITS = ["day", "month", "year"];

/** Whole units only: a 0.5-year trial is entered as 6 months. */
const isDuration = (value: unknown): value is DurationBound =>
	isPlainObject(value) &&
	Number.isInteger(value.length) &&
	(value.length as number) > 0 &&
	TRIAL_UNITS.includes(value.unit as string);

/** One duration matcher; "has a trial" is `$ne: null` and "has none" is `null`. */
const freeTrial: FieldCodec = {
	toFilter: ({ row, effect }) => {
		const path = resolve({ path: FREE_TRIAL, effect });
		if (row.operator === "has_none") return at(path, null);
		if (row.operator === "has_any") return at(path, { $ne: null });
		if (!isDuration(row.value)) return null;
		return at([...path, "duration", `$${row.operator}`], row.value);
	},
	fromFilter: ({ group, effect }) => {
		const trial = get(group, resolve({ path: FREE_TRIAL, effect }));
		if (trial === null) return [{ operator: "has_none", value: null }];
		if (isPlainObject(trial) && trial.$ne === null)
			return [{ operator: "has_any", value: null }];
		return entriesOf(get(trial, ["duration"])).map(([key, value]) => ({
			operator: key.slice(1),
			value,
		}));
	},
};

/**
 * Allow: no quantity breaks the limit (`$none` of the opposite), so plans
 * without the feature pass. Block: some quantity is past it (`$some`).
 */
const quantityPath = (effect: RuleEffect) =>
	resolve({
		path: [
			...INCOMING_PLAN,
			"feature_quantities",
			effect === "block" ? "$some" : "$none",
		],
		effect,
	});

const storedQuantityOperator = ({
	operator,
	effect,
}: {
	operator: string;
	effect: RuleEffect;
}) => (effect === "block" ? operator : NEGATED_NUMBER_OPERATORS[operator]);

const featureQuantity: FieldCodec = {
	toFilter: ({ row, effect }) => {
		const { feature_id, quantity } = (row.value ??
			{}) as Partial<FeatureQuantity>;
		if (typeof feature_id !== "string" || typeof quantity !== "number")
			return null;
		const operator = storedQuantityOperator({ operator: row.operator, effect });
		return at(quantityPath(effect), {
			feature_id,
			quantity: toMatcher({ operator, value: quantity }),
		});
	},
	fromFilter: ({ group, effect }) => {
		const limit = get(group, quantityPath(effect));
		return fromNumberMatcher(get(limit, ["quantity"])).map((read) => ({
			operator: storedQuantityOperator({ operator: read.operator, effect }),
			value: { feature_id: get(limit, ["feature_id"]), quantity: read.value },
		}));
	},
};

/**
 * An allow cap on an optional amount also passes when there's none ("no
 * refund"); a block rule only fires on an amount that's there.
 */
const amountAt = ({
	key,
	amount,
}: {
	key: string;
	amount: string;
}): FieldCodec => ({
	toFilter: ({ row, effect }) => {
		const filter = at([key, amount], toMatcher(row));
		return effect === "allow" && isCapOperator(row.operator)
			? { $or: [{ [key]: null }, filter] }
			: filter;
	},
	fromFilter: ({ group, effect }) => {
		const branches = Array.isArray(group.$or) ? group.$or : [];
		const isCapOr =
			effect === "allow" &&
			branches.length === 2 &&
			get(branches[0], [key]) === null;
		return [
			...fromNumberMatcher(get(group, [key, amount])),
			...(isCapOr ? fromNumberMatcher(get(branches[1], [key, amount])) : []),
		];
	},
});

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
	next_cycle_total: amountAt({ key: "next_cycle", amount: "total" }),
	incoming_plan: plansAt(["incoming"]),
	outgoing_plan: plansAt(["outgoing"]),
	current_plan: currentPlan,
	incoming_paid: booleanAt([...INCOMING_PLAN, "paid"]),
	incoming_recurring: booleanAt([...INCOMING_PLAN, "recurring"]),
	incoming_addon: booleanAt([...INCOMING_PLAN, "addon"]),
	free_trial: freeTrial,
	trial_card_required: booleanAt([...FREE_TRIAL, "card_required"]),
	trial_on_end: stringAt([...FREE_TRIAL, "on_end"]),
	feature_quantity: featureQuantity,
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
	refund: amountAt({ key: "refund", amount: "amount" }),
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
