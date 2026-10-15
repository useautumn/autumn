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

describe("stored design cases open in the editor", () => {
	test.each([
		["enterprise trials", "billing_change", rules.enterpriseTrials()],
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
		// Until S3 adds `$and` on plan elements, these rows collide in `incoming.$every`.
		{
			name: "Incoming plan · any of, pinned version, beside a Free trial cap",
			area: "billing_change",
			rows: [
				sampleRow("incoming_plan", "is_any_of"),
				sampleRow("free_trial", "lt"),
			],
			issue: { group: 0, row: 1 },
		},
		{
			name: "two Quantity rows in one group",
			area: "billing_change",
			rows: [
				sampleRow("feature_quantity", "lte"),
				{
					...sampleRow("feature_quantity", "lte"),
					value: { feature_id: "w", quantity: 5 },
				},
			],
			issue: { group: 0, row: 1 },
		},
	])("$name", ({ area, pinned, rows, issue }) => {
		expect(rowsToWhen({ area, pinned, groups: [rows] })).toEqual({
			ok: false,
			issues: [{ ...issue, message: expect.any(String) }],
		});
	});

	test.skip("Incoming plan · any of with a version and a Free trial combine with $and (needs S3's `$and` on PlanChangeFilter)", () => {
		expectRoundTrip("billing_change", [
			sampleRow("incoming_plan", "is_any_of"),
			sampleRow("free_trial", "lt"),
		]);
	});

	test.skip("two Quantity rows combine with $and (needs S3's `$and` on the feature_quantities element)", () => {
		expectRoundTrip("billing_change", [
			sampleRow("feature_quantity", "lte"),
			{
				field: "feature_quantity",
				operator: "lte",
				value: { feature_id: "w", quantity: 5 },
			},
		]);
	});
});
