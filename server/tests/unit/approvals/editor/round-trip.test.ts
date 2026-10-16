/**
 * S5 contract: every effect × shape × field × operator in `EDITOR_FIELDS`
 * (the When fields board) converts rows → filter → rows unchanged, and the
 * filter passes S3's validator for that effect.
 *
 * Red (before):  `ruleRowsToFilter` / `ruleFilterToRows` don't exist.
 * Green (after): each cell round-trips; rows that can't be stored report an issue.
 */

import { describe, expect, test } from "bun:test";
import {
	ACTIONS,
	type ApprovalAction,
	type ApprovalFilterKey,
	type ApprovalRuleFilter,
	type ApprovalRuleEffect as RuleEffect,
	validateApprovalRule,
} from "@autumn/shared";
import {
	EDITOR_FIELDS,
	type EditorField,
	type EditorGroup,
	type EditorRow,
	PINNED_FIELDS,
	ruleFilterToRows,
	ruleRowsToFilter,
	VALUELESS_OPERATORS,
} from "@autumn/shared/api/approvals/editor/index.js";
import { rules } from "@tests/utils/fixtures/rules.js";

/** Per field: the value for a single-value operator, then a second for "any of" / "none of". */
const SAMPLES: Record<EditorField, unknown[]> = {
	customer: ["acme", "globex"],
	customer_plan: [{ plan_id: "enterprise", version: 2 }],
	customer_has_paid: [true],
	entity: ["deployments", "seats"],
	paid: [true],
	checkout: [true],
	total: [20],
	next_cycle_total: [99],
	incoming_plan: [{ plan_id: "pro", version: 2 }, { plan_id: "team" }],
	outgoing_plan: [{ plan_id: "starter" }, { plan_id: "team" }],
	current_plan: [{ plan_id: "pro", version: 2 }, { plan_id: "team" }],
	incoming_paid: [true],
	incoming_recurring: [false],
	incoming_addon: [true],
	free_trial: [{ length: 2, unit: "month" }],
	trial_card_required: [true],
	trial_on_end: ["bill", "revert"],
	feature_quantity: [{ feature_id: "seats", quantity: 10 }],
	customized: [true],
	discount: ["launch20", "partner"],
	discount_percent_off: [20],
	discount_amount_off: [50],
	plan_schedule: ["immediate", "end_of_cycle"],
	proration_behavior: ["none", "bill_difference"],
	billing_cycle_anchor: ["now", "custom"],
	starts_at: [7],
	invoice_mode: [false],
	cancel_action: ["cancel_immediately", "cancel_end_of_cycle"],
	refund: [50],
	feature: ["ai_credits", "messages"],
	included_grant: [100],
	unlimited: [true],
	expires_at: [30],
	reset_interval: ["month", "year"],
	add_to_balance: [500],
	remaining: [1000],
	usage: [0],
	reward: ["launch20", "partner"],
	plan: ["enterprise", "pro"],
};

const sampleRow = (field: string, operator: string): EditorRow => {
	const [one, two] = SAMPLES[field as EditorField];
	const value = operator.endsWith("_of") ? [one, two] : one;
	return {
		field,
		operator,
		value: VALUELESS_OPERATORS.includes(operator) ? null : value,
	} as EditorRow;
};

/**
 * Current plan rows that store what a Customer has plan row stores read back
 * as that row: "is not" under both effects, and "is" / "is any of" under block.
 */
const readsBackAs = (effect: RuleEffect, row: EditorRow): EditorRow => {
	if (row.field !== "current_plan") return row;
	if (row.operator === "is_not")
		return { ...row, field: "customer_plan", operator: "doesnt_have" };
	const isPositive = row.operator === "is" || row.operator === "is_any_of";
	return effect === "block" && isPositive
		? { ...row, field: "customer_plan", operator: "has" }
		: row;
};

const SHAPES = Object.keys(EDITOR_FIELDS) as ApprovalFilterKey[];
const EFFECTS: RuleEffect[] = ["allow", "block"];
const fieldsOf = (shape: ApprovalFilterKey) =>
	Object.entries(EDITOR_FIELDS[shape] as Record<string, readonly string[]>);

const inBoardOrder = (shape: ApprovalFilterKey, rows: EditorRow[]) => {
	const order = Object.keys(EDITOR_FIELDS[shape]);
	return [...rows].sort(
		(a, b) => order.indexOf(a.field) - order.indexOf(b.field),
	);
};

/** One group in board order, with the shape's pinned field (Balances' Feature) moved above it. */
const editorInput = (shape: ApprovalFilterKey, rows: EditorRow[]) => {
	const pinnedField = PINNED_FIELDS[shape];
	const groupRows = inBoardOrder(
		shape,
		rows.filter((row) => row.field !== pinnedField),
	);
	const pinned = pinnedField
		? (rows.find((row) => row.field === pinnedField) ??
			sampleRow(pinnedField, "is"))
		: null;
	return { pinned, groups: groupRows.length > 0 ? [groupRows] : [] };
};

const stored = (input: {
	shape: ApprovalFilterKey;
	effect: RuleEffect;
	pinned?: EditorRow | null;
	groups: EditorGroup[];
}) => {
	const result = ruleRowsToFilter(input);
	if (!result.ok) throw new Error(JSON.stringify(result.issues));
	return result.filter;
};

const expectValid = (
	shape: ApprovalFilterKey,
	effect: RuleEffect,
	filter: ApprovalRuleFilter | null,
) => {
	const action = (Object.keys(ACTIONS) as ApprovalAction[]).find(
		(key) => ACTIONS[key].filter === shape,
	);
	const result = validateApprovalRule({
		rule: rules[effect]({ actions: [action as ApprovalAction], filter }),
	});
	expect(result.ok ? [] : result.issues).toEqual([]);
};

const expectRoundTrip = ({
	shape,
	effect,
	rows,
}: {
	shape: ApprovalFilterKey;
	effect: RuleEffect;
	rows: EditorRow[];
}) => {
	const filter = stored({ shape, effect, ...editorInput(shape, rows) });
	const readsBack = rows.map((row) => readsBackAs(effect, row));
	expect(ruleFilterToRows({ shape, effect, filter })).toEqual({
		editable: true,
		...editorInput(shape, readsBack),
	});
	expectValid(shape, effect, filter);
};

describe("every effect × field × operator round-trips", () => {
	const cells = EFFECTS.flatMap((effect) =>
		SHAPES.flatMap((shape) =>
			fieldsOf(shape).flatMap(([field, operators]) =>
				operators.map((operator) => ({ effect, shape, field, operator })),
			),
		),
	);

	test.each(cells)(
		"$effect · $shape · $field $operator",
		({ effect, shape, field, operator }) => {
			expectRoundTrip({ shape, effect, rows: [sampleRow(field, operator)] });
		},
	);

	test.each(
		EFFECTS.flatMap((effect) => SHAPES.map((shape) => ({ effect, shape }))),
	)(
		"$effect · $shape: every field at once, in one group",
		({ effect, shape }) => {
			expectRoundTrip({
				shape,
				effect,
				rows: fieldsOf(shape).map(([field, operators]) =>
					sampleRow(field, operators[0]),
				),
			});
		},
	);
});

describe("groups", () => {
	const shape = "billing_change";
	const effect = "block";

	test("a range on one field is two rows on one matcher", () => {
		const rows: EditorRow[] = [
			{ field: "total", operator: "gte", value: 10 },
			{ field: "total", operator: "lte", value: 500 },
		];
		expect(stored({ shape, effect, groups: [rows] })).toEqual({
			total: { $gte: 10, $lte: 500 },
		});
		expectRoundTrip({ shape, effect, rows });
	});

	test("OR groups become $or branches; empty groups are dropped", () => {
		const groups: EditorGroup[] = [
			[sampleRow("paid", "is")],
			[],
			[{ field: "total", operator: "lte", value: 0 }],
		];
		const filter = stored({ shape, effect, groups });
		expect(filter).toEqual({ $or: [{ paid: true }, { total: { $lte: 0 } }] });
		expectValid(shape, effect, filter);
	});

	test("one non-empty group is stored without an $or", () => {
		const groups: EditorGroup[] = [[], [sampleRow("paid", "is")], []];
		expect(stored({ shape, effect, groups })).toEqual({ paid: true });
		expect(stored({ shape, effect, groups: [[], []] })).toBeNull();
	});
});

describe("rows that set the same condition are ANDed, never overwritten", () => {
	const shape = "billing_change";
	const cap = (value: number): EditorRow => ({
		field: "discount_percent_off",
		operator: "lte",
		value,
	});

	test.each<{
		name: string;
		effect: RuleEffect;
		rows: EditorRow[];
		filter: unknown;
		readsBack?: EditorRow[];
	}>([
		{
			name: "two Customer rows",
			effect: "block",
			rows: [
				{ field: "customer", operator: "is_not", value: "acme" },
				{ field: "customer", operator: "is_not", value: "globex" },
			],
			filter: {
				customer: { customer_id: { $ne: "acme" } },
				$and: [{ customer: { customer_id: { $ne: "globex" } } }],
			},
		},
		{
			name: "three Discount caps, out of board order with another field",
			effect: "allow",
			rows: [cap(20), sampleRow("paid", "is"), cap(30), cap(40)],
			readsBack: [sampleRow("paid", "is"), cap(20), cap(30), cap(40)],
			filter: {
				paid: true,
				discounts: { $every: { percent_off: { $lte: 20 } } },
				$and: [
					{ discounts: { $every: { percent_off: { $lte: 30 } } } },
					{ discounts: { $every: { percent_off: { $lte: 40 } } } },
				],
			},
		},
		{
			name: "two Customer has plan rows stay separate checks",
			effect: "block",
			rows: [
				{
					field: "customer_plan",
					operator: "doesnt_have",
					value: { plan_id: "pro" },
				},
				{ field: "customer_plan", operator: "has_none", value: null },
			],
			filter: {
				customer: { plan: { $none: { plan_id: "pro" } } },
				$and: [{ customer: { plan: { $none: {} } } }],
			},
		},
	])("$effect · $name", ({ effect, rows, filter, readsBack = rows }) => {
		expect<unknown>(stored({ shape, effect, groups: [rows] })).toEqual(filter);
		expect(ruleFilterToRows({ shape, effect, filter })).toEqual({
			editable: true,
			pinned: null,
			groups: [readsBack],
		});
		expectValid(shape, effect, filter as ApprovalRuleFilter);
	});
});

describe("rows that can't be stored report an issue", () => {
	test.each<{
		name: string;
		shape: ApprovalFilterKey;
		pinned?: EditorRow;
		rows: EditorRow[];
		group?: number | "pinned";
	}>([
		{
			name: "Balances' Feature inside a group",
			shape: "balance_create",
			rows: [sampleRow("feature", "is")],
		},
		{
			name: "a pinned row on a shape without one",
			shape: "invoice",
			pinned: sampleRow("total", "eq"),
			rows: [],
			group: "pinned",
		},
		{
			name: "an unfinished pinned Feature",
			shape: "balance_create",
			pinned: { field: "feature", operator: "is", value: null },
			rows: [],
			group: "pinned",
		},
		{
			name: "a field from another shape",
			shape: "invoice",
			rows: [sampleRow("paid", "is")],
		},
		{
			name: "an operator the field doesn't offer",
			shape: "billing_change",
			rows: [{ field: "paid", operator: "lt", value: 1 }],
		},
		...[
			{ field: "customer_plan", operator: "has", value: null },
			{ field: "customer", operator: "is", value: null },
			{ field: "total", operator: "lte", value: undefined },
			{ field: "total", operator: "lte", value: "lots" },
			{ field: "starts_at", operator: "is", value: "7" },
			{ field: "paid", operator: "is", value: null },
			{ field: "customer", operator: "is_any_of", value: [1, 2] },
			{ field: "billing_cycle_anchor", operator: "is", value: "tomorrow" },
			{ field: "customer", operator: "is", value: "" },
			{ field: "customer_plan", operator: "has", value: { plan_id: "" } },
			{ field: "discount", operator: "is_any_of", value: [""] },
			{ field: "incoming_plan", operator: "is_any_of", value: [] },
			{ field: "outgoing_plan", operator: "is", value: null },
			{ field: "free_trial", operator: "lt", value: null },
			{ field: "feature_quantity", operator: "lte", value: null },
			{
				field: "feature_quantity",
				operator: "lte",
				value: { feature_id: "seats" },
			},
			{ field: "feature_quantity", operator: "lte", value: { quantity: 3 } },
		].map((row) => ({
			name: `an unfinished value: ${row.field} = ${JSON.stringify(row.value)}`,
			shape: "billing_change" as const,
			rows: [row as EditorRow],
		})),
	])("$name", ({ shape, pinned, rows, group = 0 }) => {
		expect(
			ruleRowsToFilter({ shape, effect: "block", pinned, groups: [rows] }),
		).toEqual({
			ok: false,
			issues: [{ group, row: 0, message: expect.any(String) }],
		});
	});
});

describe("incoming plan rows that set the same condition are ANDed", () => {
	const shape = "billing_change";
	const quantity = (feature_id: string, limit: number): EditorRow => ({
		field: "feature_quantity",
		operator: "lte",
		value: { feature_id, quantity: limit },
	});
	const every = (plan: unknown) => ({ incoming: { $every: plan } });
	const quantityCap = (feature_id: string, limit: number) =>
		every({
			feature_quantities: { $none: { feature_id, quantity: { $gt: limit } } },
		});
	const versioned = [{ plan_id: "pro", version: 2 }, { plan_id: "team" }];

	test.each<{
		name: string;
		effect: RuleEffect;
		rows: EditorRow[];
		filter: unknown;
		readsBack?: EditorRow[];
	}>([
		{
			name: "Incoming plan · any of with a version, beside a Free trial cap",
			effect: "allow",
			rows: [
				sampleRow("incoming_plan", "is_any_of"),
				sampleRow("free_trial", "lt"),
			],
			filter: every({
				$or: versioned,
				free_trial: { duration: { $lt: { length: 2, unit: "month" } } },
			}),
		},
		{
			name: "Incoming plan · is beside is any of, both with a version",
			effect: "block",
			rows: [
				sampleRow("incoming_plan", "is"),
				sampleRow("incoming_plan", "is_any_of"),
			],
			filter: {
				incoming: { $some: { plan_id: "pro", version: 2, $or: versioned } },
			},
		},
		{
			name: "two Quantity rows",
			effect: "allow",
			rows: [quantity("seats", 10), quantity("workers", 5)],
			filter: {
				...quantityCap("seats", 10),
				$and: [quantityCap("workers", 5)],
			},
		},
		{
			name: "three Quantity rows, entered out of board order with another field",
			effect: "allow",
			rows: [
				quantity("seats", 10),
				sampleRow("incoming_paid", "is"),
				quantity("a", 1),
				quantity("b", 2),
			],
			filter: {
				...every({
					paid: true,
					feature_quantities: {
						$none: { feature_id: "seats", quantity: { $gt: 10 } },
					},
				}),
				$and: [quantityCap("a", 1), quantityCap("b", 2)],
			},
			readsBack: [
				sampleRow("incoming_paid", "is"),
				quantity("seats", 10),
				quantity("a", 1),
				quantity("b", 2),
			],
		},
		...(["allow", "block"] as const).map((effect) => ({
			name: "Incoming plan · is not and is none of stay separate checks",
			effect,
			rows: [
				{
					field: "incoming_plan",
					operator: "is_not",
					value: { plan_id: "pro" },
				},
				{
					field: "incoming_plan",
					operator: "is_none_of",
					value: [{ plan_id: "team", version: 2 }, { plan_id: "max" }],
				},
			] as EditorRow[],
			filter: {
				incoming: { $none: { plan_id: "pro" } },
				$and: [
					{
						incoming: {
							$none: {
								$or: [{ plan_id: "team", version: 2 }, { plan_id: "max" }],
							},
						},
					},
				],
			},
		})),
	])("$effect · $name", ({ effect, rows, filter, readsBack = rows }) => {
		expect<unknown>(stored({ shape, effect, groups: [rows] })).toEqual(filter);
		expect(ruleFilterToRows({ shape, effect, filter })).toEqual({
			editable: true,
			pinned: null,
			groups: [readsBack],
		});
		expectValid(shape, effect, filter as ApprovalRuleFilter);
	});
});
