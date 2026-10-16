import type { DurationBound } from "../../common/filters/durationMatcher";
import type { ApprovalFilterKey } from "../schemas/filters/approvalFilterShapes";

const ID_OPERATORS = ["is", "is_not", "is_any_of", "is_none_of"] as const;
const NUMBER_OPERATORS = ["eq", "ne", "lt", "lte", "gt", "gte"] as const;
const ENUM_OPERATORS = ["is", "is_any_of"] as const;
const IS = ["is"] as const;

const customerFields = {
	customer: ID_OPERATORS,
	customer_plan: ["has", "doesnt_have", "has_none"],
	customer_has_paid: IS,
} as const;

const ENTITY_OPERATORS = [
	"is_customer",
	"is_entity",
	"is_any_of",
	"is_none_of",
] as const;

const uncancelFields = {
	...customerFields,
	entity: ENTITY_OPERATORS,
	outgoing_plan: ID_OPERATORS,
} as const;

/** The "When fields by area" board: filter shape → field → operators, in board order. */
export const EDITOR_FIELDS = {
	billing_change: {
		...customerFields,
		entity: ENTITY_OPERATORS,
		paid: IS,
		checkout: IS,
		total: NUMBER_OPERATORS,
		next_cycle_total: NUMBER_OPERATORS,
		incoming_plan: ID_OPERATORS,
		outgoing_plan: ID_OPERATORS,
		current_plan: ID_OPERATORS,
		incoming_paid: IS,
		incoming_recurring: IS,
		incoming_addon: IS,
		free_trial: ["lt", "lte", "eq", "gte", "gt", "has_none", "has_any"],
		trial_card_required: IS,
		trial_on_end: ENUM_OPERATORS,
		feature_quantity: NUMBER_OPERATORS,
		customized: IS,
		discount: ID_OPERATORS,
		discount_percent_off: NUMBER_OPERATORS,
		discount_amount_off: NUMBER_OPERATORS,
		plan_schedule: ENUM_OPERATORS,
		proration_behavior: ENUM_OPERATORS,
		billing_cycle_anchor: ENUM_OPERATORS,
		starts_at: IS,
		invoice_mode: IS,
	},
	billing_cancel: {
		...customerFields,
		entity: ENTITY_OPERATORS,
		cancel_action: ENUM_OPERATORS,
		outgoing_plan: ID_OPERATORS,
		refund: NUMBER_OPERATORS,
	},
	billing_uncancel: uncancelFields,
	invoice: {
		...customerFields,
		total: NUMBER_OPERATORS,
		refund: NUMBER_OPERATORS,
	},
	balance_create: {
		...customerFields,
		feature: ENUM_OPERATORS,
		included_grant: NUMBER_OPERATORS,
		unlimited: IS,
		expires_at: IS,
		reset_interval: ENUM_OPERATORS,
	},
	balance_update: {
		...customerFields,
		feature: ENUM_OPERATORS,
		add_to_balance: NUMBER_OPERATORS,
		remaining: NUMBER_OPERATORS,
		usage: NUMBER_OPERATORS,
		included_grant: NUMBER_OPERATORS,
	},
	reward_redeem: { ...customerFields, reward: ID_OPERATORS },
	customer_change: customerFields,
	plan: { plan: ID_OPERATORS },
	feature: { feature: ID_OPERATORS },
} as const satisfies Record<
	ApprovalFilterKey,
	Record<string, readonly string[]>
>;

/** Operators that are complete on their own; their row's value is null. */
export const VALUELESS_OPERATORS: readonly string[] = [
	"has_none",
	"has_any",
	"is_customer",
	"is_entity",
];

type ShapeFields<Shape extends ApprovalFilterKey> =
	(typeof EDITOR_FIELDS)[Shape];

export type EditorField = {
	[Shape in ApprovalFilterKey]: keyof ShapeFields<Shape>;
}[ApprovalFilterKey];

type OperatorsOf<Operators> = Operators extends readonly (infer Operator)[]
	? Operator
	: never;

export type EditorOperator = {
	[Shape in ApprovalFilterKey]: OperatorsOf<
		ShapeFields<Shape>[keyof ShapeFields<Shape>]
	>;
}[ApprovalFilterKey];

/** A plan picker's choice; no `version` means any version. */
export type PlanSelection = { plan_id: string; version?: number };
export type FeatureQuantity = { feature_id: string; quantity: number };

/**
 * `*_any_of` / `*_none_of` take arrays, valueless operators take null;
 * `starts_at` and `expires_at` take a number of days.
 */
export type EditorRowValue =
	| string
	| string[]
	| number
	| boolean
	| PlanSelection
	| PlanSelection[]
	| DurationBound
	| FeatureQuantity
	| null;

/** Rows carry no effect; only the stored filter depends on it. */
export type EditorRow = {
	field: EditorField;
	operator: EditorOperator;
	value: EditorRowValue;
};

/** Rows ANDed together; a rule's groups are ORed. */
export type EditorGroup = EditorRow[];

/** Fields set once for the whole rule, above its groups: Balances amounts are in the Feature's unit. */
export const PINNED_FIELDS: Partial<Record<ApprovalFilterKey, EditorField>> = {
	balance_create: "feature",
	balance_update: "feature",
};
