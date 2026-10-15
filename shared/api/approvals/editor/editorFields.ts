import type { WhenKey } from "../schemas/when/whenSchemas";

const ID_OPERATORS = ["is", "is_not", "is_any_of", "is_none_of"] as const;
const NUMBER_OPERATORS = ["eq", "ne", "lt", "lte", "gt", "gte"] as const;
const ENUM_OPERATORS = ["is", "is_any_of"] as const;
const IS = ["is"] as const;

const customerFields = {
	customer: ID_OPERATORS,
	customer_plan: ["has", "doesnt_have", "has_none"],
} as const;

/** The "When fields by area" board: area → field → operators, in board order. */
export const EDITOR_FIELDS = {
	billing_change: {
		...customerFields,
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
		starts_at: IS,
		invoice_mode: IS,
	},
	billing_cancel: {
		...customerFields,
		cancel_action: ENUM_OPERATORS,
	},
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
	reward_apply: { ...customerFields, reward: ID_OPERATORS },
	customer: customerFields,
	catalog_plan: { plan: ID_OPERATORS },
	catalog_feature: { feature: ID_OPERATORS },
} as const satisfies Record<WhenKey, Record<string, readonly string[]>>;

type AreaFields<Area extends WhenKey> = (typeof EDITOR_FIELDS)[Area];

export type EditorField = {
	[Area in WhenKey]: keyof AreaFields<Area>;
}[WhenKey];

type OperatorsOf<Operators> = Operators extends readonly (infer Operator)[]
	? Operator
	: never;

export type EditorOperator = {
	[Area in WhenKey]: OperatorsOf<AreaFields<Area>[keyof AreaFields<Area>]>;
}[WhenKey];

/** A plan picker's choice; no `version` means any version. */
export type PlanSelection = { plan_id: string; version?: number };

/**
 * `*_any_of` / `*_none_of` take arrays, `has_none` takes null; `starts_at` and
 * `expires_at` take a number of days.
 */
export type EditorRowValue =
	| string
	| string[]
	| number
	| boolean
	| PlanSelection
	| null;

export type EditorRow = {
	field: EditorField;
	operator: EditorOperator;
	value: EditorRowValue;
};

/** Rows ANDed together; a rule's groups are ORed. */
export type EditorGroup = EditorRow[];
