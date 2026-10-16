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
	incoming_paid: [true],
	incoming_recurring: [false],
	incoming_addon: [true],
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

const stored = (input: {
	shape: ApprovalFilterKey;
	effect: RuleEffect;
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

/** Balances rules must choose a Feature, so their rows always carry one. */
const withFeature = (shape: ApprovalFilterKey, rows: EditorRow[]) =>
	shape.startsWith("balance_") && !rows.some((row) => row.field === "feature")
		? [sampleRow("feature", "is"), ...rows]
		: rows;

const expectRoundTrip = ({
	shape,
	effect,
	rows,
}: {
	shape: ApprovalFilterKey;
	effect: RuleEffect;
	rows: EditorRow[];
}) => {
	const groups = [inBoardOrder(shape, withFeature(shape, rows))];
	const filter = stored({ shape, effect, groups });
	expect(ruleFilterToRows({ shape, effect, filter })).toEqual({
		editable: true,
		groups,
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
			groups: [readsBack],
		});
		expectValid(shape, effect, filter as ApprovalRuleFilter);
	});
});

describe("rows that can't be stored report an issue", () => {
	test.each<{ name: string; shape: ApprovalFilterKey; rows: EditorRow[] }>([
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
			{ field: "discount", operator: "is_any_of", value: [""] },
		].map((row) => ({
			name: `an unfinished value: ${row.field} = ${JSON.stringify(row.value)}`,
			shape: "billing_change" as const,
			rows: [row as EditorRow],
		})),
	])("$name", ({ shape, rows }) => {
		expect(
			ruleRowsToFilter({ shape, effect: "block", groups: [rows] }),
		).toEqual({
			ok: false,
			issues: [{ group: 0, row: 0, message: expect.any(String) }],
		});
	});
});
