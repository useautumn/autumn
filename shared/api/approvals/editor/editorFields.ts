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

const uncancelFields = { ...customerFields, entity: ENTITY_OPERATORS } as const;

/** The "When fields by area" board: filter shape → field → operators, in board order. */
export const EDITOR_FIELDS = {
	billing_change: {
		...customerFields,
		entity: ENTITY_OPERATORS,
		paid: IS,
		checkout: IS,
		total: NUMBER_OPERATORS,
		incoming_paid: IS,
		incoming_recurring: IS,
		incoming_addon: IS,
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
	billing_cancel: { ...uncancelFields, cancel_action: ENUM_OPERATORS },
	billing_uncancel: uncancelFields,
	invoice: {
		...customerFields,
		total: NUMBER_OPERATORS,
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
	| null;

/** Rows carry no effect; only the stored filter depends on it. */
export type EditorRow = {
	field: EditorField;
	operator: EditorOperator;
	value: EditorRowValue;
};

/** Rows ANDed together; a rule's groups are ORed. */
export type EditorGroup = EditorRow[];
