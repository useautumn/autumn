/**
 * S5 contract: every field × operator in `EDITOR_FIELDS` (the When fields
 * board) converts rows → `when` → rows unchanged, and the `when` passes S3's validator.
 *
 * Red (before):  `rowsToWhen` / `whenToRows` don't exist.
 * Green (after): each cell round-trips; rows that can't be stored report an issue.
 */

import { describe, expect, test } from "bun:test";
import {
	ACTIONS,
	type ApprovalAction,
	validateApprovalRule,
	type WhenKey,
} from "@autumn/shared";
import {
	EDITOR_FIELDS,
	type EditorField,
	type EditorGroup,
	type EditorRow,
	PINNED_FIELDS,
	rowsToWhen,
	whenToRows,
} from "@autumn/shared/api/approvals/editor/index.js";
import { rules } from "@tests/utils/fixtures/rules.js";

/** Per field: the value for a single-value operator, then a second for "any of" / "none of". */
const SAMPLES: Record<EditorField, unknown[]> = {
	customer: ["acme", "globex"],
	customer_plan: [{ plan_id: "enterprise", version: 2 }],
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
		value: operator === "has_none" ? null : value,
	} as EditorRow;
};

/** Board cells that store the same filter as an earlier field, which reads it back. */
const ALIASES: Record<string, EditorRow> = {
	"current_plan:is_not": {
		field: "customer_plan",
		operator: "doesnt_have",
		value: { plan_id: "pro", version: 2 },
	},
};

const AREAS = Object.keys(EDITOR_FIELDS) as WhenKey[];
const fieldsOf = (area: WhenKey) =>
	Object.entries(EDITOR_FIELDS[area] as Record<string, readonly string[]>);

/** One group of rows, with the area's pinned field (Balances' Feature) moved above it. */
const editorInput = (area: WhenKey, rows: EditorRow[]) => {
	const pinnedField = PINNED_FIELDS[area];
	const groupRows = rows.filter((row) => row.field !== pinnedField);
	const pinned = pinnedField
		? (rows.find((row) => row.field === pinnedField) ??
			sampleRow(pinnedField, "is"))
		: null;
	return { pinned, groups: groupRows.length > 0 ? [groupRows] : [] };
};

const stored = (input: {
	area: WhenKey;
	pinned?: EditorRow | null;
	groups: EditorGroup[];
}) => {
	const result = rowsToWhen(input);
	if (!result.ok) throw new Error(JSON.stringify(result.issues));
	return result.when;
};

const expectValid = (area: WhenKey, when: unknown) => {
	const action = (Object.keys(ACTIONS) as ApprovalAction[]).find(
		(key) => ACTIONS[key].when === area,
	);
	const result = validateApprovalRule({
		...rules.rule({ actions: [action as ApprovalAction] }),
		when,
	});
	expect(result.ok ? [] : result.issues).toEqual([]);
};

const expectRoundTrip = (
	area: WhenKey,
	rows: EditorRow[],
	readsBack = rows,
) => {
	const when = stored({ area, ...editorInput(area, rows) });
	expect(whenToRows({ area, when })).toEqual({
		editable: true,
		...editorInput(area, readsBack),
	});
	expectValid(area, when);
};

describe("every field × operator round-trips", () => {
	const cells = AREAS.flatMap((area) =>
		fieldsOf(area).flatMap(([field, operators]) =>
			operators.map((operator) => ({ area, field, operator })),
		),
	);

	test.each(cells)("$area · $field $operator", ({ area, field, operator }) => {
		const row = sampleRow(field, operator);
		expectRoundTrip(area, [row], [ALIASES[`${field}:${operator}`] ?? row]);
	});

	test.each(AREAS)("%s: every field at once, in one group", (area) => {
		expectRoundTrip(
			area,
			fieldsOf(area).map(([field, operators]) =>
				sampleRow(field, operators[0]),
			),
		);
	});
});

describe("groups", () => {
	test("a range on one field is two rows on one matcher", () => {
		const rows: EditorRow[] = [
			{ field: "total", operator: "gte", value: 10 },
			{ field: "total", operator: "lte", value: 500 },
		];
		expect(stored({ area: "billing_change", groups: [rows] })).toEqual({
			total: { $gte: 10, $lte: 500 },
		});
		expectRoundTrip("billing_change", rows);
	});

	test("OR groups become $or branches; empty groups are dropped", () => {
		const groups: EditorGroup[] = [
			[sampleRow("paid", "is")],
			[],
			[{ field: "total", operator: "lte", value: 0 }],
		];
		const when = stored({ area: "billing_change", groups });
		expect(when).toEqual({ $or: [{ paid: true }, { total: { $lte: 0 } }] });
		expectValid("billing_change", when);
	});

	test("one non-empty group is stored without an $or", () => {
		const groups: EditorGroup[] = [[], [sampleRow("paid", "is")], []];
		expect(stored({ area: "billing_change", groups })).toEqual({ paid: true });
		expect(stored({ area: "billing_change", groups: [[], []] })).toBeNull();
	});

	test("Custom pricing stores `customized`, never the plan filter's `custom`", () => {
		const when = stored({
			area: "billing_change",
			groups: [[sampleRow("customized", "is")]],
		});
		expect(when).toEqual({ incoming: { $every: { customized: true } } });
		expectValid("billing_change", when);
	});

	test("Balances keep Feature above the groups", () => {
		const input = {
			pinned: sampleRow("feature", "is"),
			groups: [
				[{ field: "included_grant", operator: "lte", value: 50 }],
				[sampleRow("unlimited", "is")],
			] as EditorGroup[],
		};
		const when = stored({ area: "balance_create", ...input });
		expect(when).toEqual({
			feature_id: "ai_credits",
			$or: [{ included_grant: { $lte: 50 } }, { unlimited: true }],
		});
		expect(whenToRows({ area: "balance_create", when })).toEqual({
			editable: true,
			...input,
		});
		expectValid("balance_create", when);
	});
});

describe("rows that set the same condition are ANDed, never overwritten", () => {
	const cap = (value: number): EditorRow => ({
		field: "discount_percent_off",
		operator: "lte",
		value,
	});

	test.each<{
		name: string;
		rows: EditorRow[];
		when: unknown;
		readsBack?: EditorRow[];
	}>([
		{
			name: "two Customer rows",
			rows: [
				{ field: "customer", operator: "is_not", value: "acme" },
				{ field: "customer", operator: "is_not", value: "globex" },
			],
			when: {
				customer: { customer_id: { $ne: "acme" } },
				$and: [{ customer: { customer_id: { $ne: "globex" } } }],
			},
		},
		{
			name: "three Discount caps, out of board order with another field",
			rows: [cap(20), sampleRow("paid", "is"), cap(30), cap(40)],
			readsBack: [sampleRow("paid", "is"), cap(20), cap(30), cap(40)],
			when: {
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
			rows: [
				{
					field: "customer_plan",
					operator: "doesnt_have",
					value: { plan_id: "pro" },
				},
				{ field: "customer_plan", operator: "has_none", value: null },
			],
			when: {
				customer: { plan: { $none: { plan_id: "pro" } } },
				$and: [{ customer: { plan: { $none: {} } } }],
			},
		},
	])("$name", ({ rows, when, readsBack = rows }) => {
		const area = "billing_change";
		expect<unknown>(stored({ area, groups: [rows] })).toEqual(when);
		expect(whenToRows({ area, when })).toEqual({
			editable: true,
			pinned: null,
			groups: [readsBack],
		});
		expectValid(area, when);
	});
});

describe("stored design cases open in the editor", () => {
	test.each([
		["recurring discounts", "billing_change", rules.recurringDiscounts()],
		["support cancellations", "billing_cancel", rules.supportCancellations()],
		[
			"credit grants",
			"balance_create",
			rules.creditGrants({ maxGrant: 50, subjects: [{ type: "everyone" }] }),
		],
	] as const)("%s", (_name, area, rule) => {
		const read = whenToRows({ area, when: rule.when });
		if (!read.editable) throw new Error("not editable");
		expect(stored({ area, pinned: read.pinned, groups: read.groups })).toEqual(
			rule.when,
		);
	});

	test("support cancellations read as two groups", () => {
		expect(
			whenToRows({
				area: "billing_cancel",
				when: rules.supportCancellations().when,
			}),
		).toEqual({
			editable: true,
			pinned: null,
			groups: [
				[
					{
						field: "cancel_action",
						operator: "is",
						value: "cancel_end_of_cycle",
					},
				],
				[
					sampleRow("cancel_action", "is"),
					sampleRow("outgoing_plan", "is"),
					{ field: "refund", operator: "lte", value: 50 },
				],
			],
		});
	});
});

type IssueCase = {
	name: string;
	area: WhenKey;
	pinned?: EditorRow;
	rows: EditorRow[];
	issue: { group: number | "pinned"; row: number };
};

describe("rows that can't be stored report an issue", () => {
	test.each<IssueCase>([
		{
			name: "a field from another area",
			area: "invoice",
			rows: [sampleRow("paid", "is")],
			issue: { group: 0, row: 0 },
		},
		{
			name: "an operator the field doesn't offer",
			area: "billing_change",
			rows: [{ field: "paid", operator: "lt", value: 1 }],
			issue: { group: 0, row: 0 },
		},
		{
			name: "Balances' Feature inside a group",
			area: "balance_create",
			rows: [sampleRow("feature", "is")],
			issue: { group: 0, row: 0 },
		},
		{
			name: "a pinned row on an area without one",
			area: "invoice",
			pinned: sampleRow("total", "eq"),
			rows: [],
			issue: { group: "pinned", row: 0 },
		},
		...[
			{ field: "customer_plan", operator: "has", value: null },
			{ field: "customer", operator: "is", value: null },
			{ field: "total", operator: "lte", value: "lots" },
			{ field: "starts_at", operator: "is", value: "7" },
			{ field: "paid", operator: "is", value: null },
			{ field: "customer", operator: "is_any_of", value: [1, 2] },
			{ field: "incoming_plan", operator: "is_any_of", value: [] },
			{ field: "outgoing_plan", operator: "is", value: null },
			{ field: "free_trial", operator: "lt", value: null },
			{ field: "feature_quantity", operator: "lte", value: null },
		].map((row) => ({
			name: `an unfinished value: ${row.field} = ${JSON.stringify(row.value)}`,
			area: "billing_change" as const,
			rows: [row as EditorRow],
			issue: { group: 0, row: 0 },
		})),
		{
			name: "an unfinished pinned Feature",
			area: "balance_create",
			pinned: { field: "feature", operator: "is", value: null },
			rows: [],
			issue: { group: "pinned", row: 0 },
		},
	])("$name", ({ area, pinned, rows, issue }) => {
		expect(rowsToWhen({ area, pinned, groups: [rows] })).toEqual({
			ok: false,
			issues: [{ ...issue, message: expect.any(String) }],
		});
	});
});

describe("incoming plan rows that set the same condition are ANDed", () => {
	const quantity = (feature_id: string, quantity: number): EditorRow => ({
		field: "feature_quantity",
		operator: "lte",
		value: { feature_id, quantity },
	});
	const incoming = (plan: unknown) => ({ incoming: { $every: plan } });
	const quantityLimit = (feature_id: string, limit: number) =>
		incoming({
			feature_quantities: { $none: { feature_id, quantity: { $gt: limit } } },
		});
	const trialCap = {
		$or: [
			{ free_trial: null },
			...(["day", "month", "year"] as const).map((type, index) => ({
				free_trial: {
					duration_type: type,
					duration_length: { $lt: 60 / [1, 30, 365][index] },
				},
			})),
		],
	};
	const versioned = [{ plan_id: "pro", version: 2 }, { plan_id: "team" }];

	test.each<{
		name: string;
		rows: EditorRow[];
		when: unknown;
		readsBack?: EditorRow[];
	}>([
		{
			name: "Incoming plan · any of with a version, beside a Free trial cap",
			rows: [
				sampleRow("incoming_plan", "is_any_of"),
				sampleRow("free_trial", "lt"),
			],
			when: { ...incoming({ $or: versioned }), $and: [incoming(trialCap)] },
		},
		{
			name: "Incoming plan · is with a version, beside is any of with a version",
			rows: [
				sampleRow("incoming_plan", "is"),
				sampleRow("incoming_plan", "is_any_of"),
			],
			when: incoming({ plan_id: "pro", version: 2, $or: versioned }),
		},
		{
			name: "Incoming plan · is with a version, beside is any of without one",
			rows: [
				sampleRow("incoming_plan", "is"),
				{
					field: "incoming_plan",
					operator: "is_any_of",
					value: [{ plan_id: "pro" }, { plan_id: "team" }],
				},
			],
			when: {
				...incoming({ plan_id: "pro", version: 2 }),
				$and: [incoming({ plan_id: { $in: ["pro", "team"] } })],
			},
		},
		{
			name: "two Quantity rows",
			rows: [quantity("seats", 10), quantity("workers", 5)],
			when: {
				...quantityLimit("seats", 10),
				$and: [quantityLimit("workers", 5)],
			},
		},
		{
			name: "a range on one feature keeps both limits",
			rows: [
				{ ...quantity("seats", 5), operator: "gte" },
				quantity("seats", 10),
			],
			when: {
				...incoming({
					feature_quantities: {
						$none: { feature_id: "seats", quantity: { $lt: 5 } },
					},
				}),
				$and: [quantityLimit("seats", 10)],
			},
		},
		{
			name: "three Quantity rows, entered out of board order with another field",
			rows: [
				quantity("seats", 10),
				sampleRow("incoming_paid", "is"),
				quantity("a", 1),
				quantity("b", 2),
			],
			when: {
				...incoming({
					paid: true,
					feature_quantities: {
						$none: { feature_id: "seats", quantity: { $gt: 10 } },
					},
				}),
				$and: [quantityLimit("a", 1), quantityLimit("b", 2)],
			},
			readsBack: [
				sampleRow("incoming_paid", "is"),
				quantity("seats", 10),
				quantity("a", 1),
				quantity("b", 2),
			],
		},
		{
			name: "Incoming plan · is not and is none of stay separate checks",
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
			],
			when: {
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
		},
		{
			name: "Free trial · has none beside < 2 months",
			rows: [
				{ field: "free_trial", operator: "has_none", value: null },
				sampleRow("free_trial", "lt"),
			],
			when: incoming({ free_trial: null, ...trialCap }),
		},
	])("$name", ({ rows, when, readsBack }) => {
		expect<unknown>(stored({ area: "billing_change", groups: [rows] })).toEqual(
			when,
		);
		expectRoundTrip("billing_change", rows, readsBack);
	});
});
