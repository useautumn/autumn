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
	incoming_paid: [true],
	incoming_recurring: [false],
	incoming_addon: [true],
	customized: [true],
	discount: ["launch20", "partner"],
	discount_percent_off: [20],
	discount_amount_off: [50],
	plan_schedule: ["immediate", "end_of_cycle"],
	proration_behavior: ["none", "bill_difference"],
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
		value: operator === "has_none" ? null : value,
	} as EditorRow;
};

const AREAS = Object.keys(EDITOR_FIELDS) as WhenKey[];
const fieldsOf = (area: WhenKey) =>
	Object.entries(EDITOR_FIELDS[area] as Record<string, readonly string[]>);

/** One group of rows in board order; Balances rules also need a Feature row. */
const editorInput = (area: WhenKey, rows: EditorRow[]) => {
	const needsFeature =
		area.startsWith("balance_") && !rows.some((row) => row.field === "feature");
	const order = Object.keys(EDITOR_FIELDS[area]);
	const group = needsFeature
		? [sampleRow("feature", "is"), ...rows]
		: [...rows];
	group.sort((a, b) => order.indexOf(a.field) - order.indexOf(b.field));
	return { groups: [group] };
};

const stored = (input: { area: WhenKey; groups: EditorGroup[] }) => {
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

const expectRoundTrip = (area: WhenKey, rows: EditorRow[]) => {
	const when = stored({ area, ...editorInput(area, rows) });
	expect(whenToRows({ area, when })).toEqual({
		editable: true,
		...editorInput(area, rows),
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
		expectRoundTrip(area, [sampleRow(field, operator)]);
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
});

describe("stored design cases open in the editor", () => {
	test.each([
		["recurring discounts", "billing_change", rules.recurringDiscounts()],
		[
			"credit grants",
			"balance_create",
			rules.creditGrants({ maxGrant: 50, subjects: [{ type: "everyone" }] }),
		],
	] as const)("%s", (_name, area, rule) => {
		const read = whenToRows({ area, when: rule.when });
		if (!read.editable) throw new Error("not editable");
		expect(stored({ area, groups: read.groups })).toEqual(rule.when);
	});
});

type IssueCase = {
	name: string;
	area: WhenKey;
	rows: EditorRow[];
	issue: { group: number; row: number };
};

describe("rows that can't be stored report an issue", () => {
	test.each<IssueCase>([
		{
			name: "the same matcher twice in one group",
			area: "billing_change",
			rows: [
				sampleRow("customer", "is"),
				{ ...sampleRow("customer", "is"), value: "b" },
			],
			issue: { group: 0, row: 1 },
		},
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
		...[
			{ field: "customer_plan", operator: "has", value: null },
			{ field: "customer", operator: "is", value: null },
			{ field: "total", operator: "lte", value: "lots" },
			{ field: "starts_at", operator: "is", value: "7" },
			{ field: "paid", operator: "is", value: null },
			{ field: "customer", operator: "is_any_of", value: [1, 2] },
		].map((row) => ({
			name: `an unfinished value: ${row.field} = ${JSON.stringify(row.value)}`,
			area: "billing_change" as const,
			rows: [row as EditorRow],
			issue: { group: 0, row: 0 },
		})),
	])("$name", ({ area, rows, issue }) => {
		expect(rowsToWhen({ area, groups: [rows] })).toEqual({
			ok: false,
			issues: [{ ...issue, message: expect.any(String) }],
		});
	});
});
