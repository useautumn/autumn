import { isPlainObject } from "../schemas/isPlainObject";
import type {
	EditorField,
	EditorRow,
	FeatureQuantity,
	TrialDuration,
} from "./editorFields";
import {
	at,
	type Filter,
	fromNumberMatcher,
	fromPlanFilter,
	fromStringMatcher,
	get,
	isCapOperator,
	isEmptyObject,
	isPlanBranches,
	NEGATED_NUMBER_OPERATORS,
	planSelectionsOf,
	type RowRead,
	toMatcher,
	toPlanFilter,
} from "./filterParts";
import { fromTrialBranches, toTrialBranches } from "./freeTrialBranches";

/** How one field's rows are stored in a group's filter, and read back out of it. */
type FieldCodec = {
	/** Null when the row's value can't be stored. */
	toFilter: (row: EditorRow) => Filter | null;
	fromFilter: (group: Filter) => RowRead[];
};

const INCOMING_PLAN = ["incoming", "$every"];
const QUANTITY_LIMIT = [...INCOMING_PLAN, "feature_quantities", "$none"];

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
	toFilter: (row) =>
		typeof row.value === "number" ? at(path, sign * row.value) : null,
	fromFilter: (group) => {
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

/** Every plan must match ("is"), or none may ("is not"). */
const plansAt = (path: string[]): FieldCodec => ({
	toFilter: (row) => {
		const isNegative =
			row.operator === "is_not" || row.operator === "is_none_of";
		const plans = toPlanFilter(row.value);
		return plans && at([...path, isNegative ? "$none" : "$every"], plans);
	},
	fromFilter: (group) => [
		...planReads({ filter: get(group, [...path, "$every"]), negative: false }),
		...planReads({ filter: get(group, [...path, "$none"]), negative: true }),
	],
});

const CUSTOMER_PLAN = ["customer", "plan"];

const customerPlan: FieldCodec = {
	toFilter: (row) => {
		if (row.operator === "has_none") return at([...CUSTOMER_PLAN, "$none"], {});
		const plan = toPlanFilter(row.value);
		const quantifier = row.operator === "has" ? "$some" : "$none";
		return plan && at([...CUSTOMER_PLAN, quantifier], plan);
	},
	fromFilter: (group) => {
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

// "Current plan is not X" is the same filter as "Customer doesn't have X", which reads it.
const currentPlan: FieldCodec = {
	toFilter: currentPlans.toFilter,
	fromFilter: (group) =>
		currentPlans.fromFilter(group).filter((read) => read.operator !== "is_not"),
};

const freeTrial: FieldCodec = {
	toFilter: (row) => {
		if (row.operator === "has_none")
			return at([...INCOMING_PLAN, "free_trial"], null);
		const duration = row.value as TrialDuration | null;
		if (!isPlainObject(duration)) return null;
		const branches = toTrialBranches({ operator: row.operator, duration });
		return at([...INCOMING_PLAN, "$or"], branches);
	},
	fromFilter: (group) => {
		const plan = get(group, INCOMING_PLAN);
		if (!isPlainObject(plan)) return [];
		const trial = isPlanBranches(plan.$or) ? null : fromTrialBranches(plan.$or);
		return [
			...(plan.free_trial === null
				? [{ operator: "has_none", value: null }]
				: []),
			...(trial ? [{ operator: trial.operator, value: trial.duration }] : []),
		];
	},
};

// Stored as "no quantity breaks the limit", so plans without the feature pass.
const featureQuantity: FieldCodec = {
	toFilter: (row) => {
		if (!isPlainObject(row.value)) return null;
		const { feature_id, quantity } = row.value as FeatureQuantity;
		const operator = NEGATED_NUMBER_OPERATORS[row.operator];
		return at(QUANTITY_LIMIT, {
			feature_id,
			quantity: toMatcher({ operator, value: quantity }),
		});
	},
	fromFilter: (group) =>
		fromNumberMatcher(get(group, [...QUANTITY_LIMIT, "quantity"])).map(
			(limit) => ({
				operator: NEGATED_NUMBER_OPERATORS[limit.operator],
				value: {
					feature_id: get(group, [...QUANTITY_LIMIT, "feature_id"]),
					quantity: limit.value,
				},
			}),
		),
};

/** A cap on an optional amount also passes when there's none, like a trial cap. */
const amountAt = ({
	key,
	amount,
}: {
	key: string;
	amount: string;
}): FieldCodec => ({
	toFilter: (row) => {
		const filter = at([key, amount], toMatcher(row));
		return isCapOperator(row.operator)
			? { $or: [{ [key]: null }, filter] }
			: filter;
	},
	fromFilter: (group) => {
		const branches = Array.isArray(group.$or) ? group.$or : [];
		const isCapOr = branches.length === 2 && get(branches[0], [key]) === null;
		return [
			...fromNumberMatcher(get(group, [key, amount])),
			...(isCapOr ? fromNumberMatcher(get(branches[1], [key, amount])) : []),
		];
	},
});

export const FIELD_CODECS: Record<EditorField, FieldCodec> = {
	customer: stringAt(["customer", "customer_id"]),
	customer_plan: customerPlan,
	current_plan: currentPlan,
	paid: booleanAt(["paid"]),
	checkout: booleanAt(["checkout"]),
	total: numberAt(["total"]),
	next_cycle_total: amountAt({ key: "next_cycle", amount: "total" }),
	incoming_plan: plansAt(["incoming"]),
	outgoing_plan: plansAt(["outgoing"]),
	incoming_paid: booleanAt([...INCOMING_PLAN, "paid"]),
	incoming_recurring: booleanAt([...INCOMING_PLAN, "recurring"]),
	incoming_addon: booleanAt([...INCOMING_PLAN, "addon"]),
	free_trial: freeTrial,
	trial_card_required: booleanAt([
		...INCOMING_PLAN,
		"free_trial",
		"card_required",
	]),
	trial_on_end: stringAt([...INCOMING_PLAN, "free_trial", "on_end"]),
	feature_quantity: featureQuantity,
	customized: booleanAt([...INCOMING_PLAN, "customized"]),
	discount: stringAt(["discounts", "$every", "reward_id"]),
	discount_percent_off: numberAt(["discounts", "$every", "percent_off"]),
	discount_amount_off: numberAt(["discounts", "$every", "amount_off"]),
	plan_schedule: stringAt(["plan_schedule"]),
	proration_behavior: stringAt(["proration_behavior"]),
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
