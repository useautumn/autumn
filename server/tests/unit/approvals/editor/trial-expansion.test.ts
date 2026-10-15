/**
 * S5 contract: a "Free trial" row is stored as one `$or` over trial units
 * (plus "no trial" for caps) and that `$or` reads back as the one row.
 *
 * Red (before):  `rowsToWhen` / `whenToRows` don't exist.
 * Green (after): each duration expands as listed and collapses back.
 */

import { expect, test } from "bun:test";
import {
	type EditorRow,
	rowsToWhen,
	whenToRows,
} from "@autumn/shared/api/approvals/editor/index.js";
import { rules } from "@tests/utils/fixtures/rules.js";

type Unit = "day" | "month" | "year";

const trial = (operator: string, length: number, unit: Unit) =>
	({ field: "free_trial", operator, value: { length, unit } }) as EditorRow;

const unit = (type: Unit, length?: Record<string, number>) => ({
	free_trial: length
		? { duration_type: type, duration_length: length }
		: { duration_type: type },
});

const noTrial = { free_trial: null };
const inIncoming = (plan: unknown) => ({ incoming: { $every: plan } });

const CASES: {
	name: string;
	rows: EditorRow[];
	when: unknown;
	readsBack?: EditorRow[];
}[] = [
	{
		name: "design case 1: Enterprise, no charge, trial < 2 months",
		rows: [
			{ field: "paid", operator: "is", value: false },
			{
				field: "incoming_plan",
				operator: "is",
				value: { plan_id: "enterprise" },
			},
			trial("lt", 2, "month"),
		],
		when: rules.enterpriseTrials().when,
	},
	{
		name: "< 45 days keeps days (1.5 months isn't whole)",
		rows: [trial("lt", 45, "day")],
		when: inIncoming({
			$or: [noTrial, unit("day", { $lt: 45 }), unit("month", { $lt: 1.5 })],
		}),
	},
	{
		name: "≤ 1 year includes every unit",
		rows: [trial("lte", 1, "year")],
		when: inIncoming({
			$or: [
				noTrial,
				unit("day", { $lte: 365 }),
				unit("month", { $lte: 365 / 30 }),
				unit("year", { $lte: 1 }),
			],
		}),
	},
	{
		name: "> 2 months has no 'no trial' branch; any year is longer",
		rows: [trial("gt", 2, "month")],
		when: inIncoming({
			$or: [unit("day", { $gt: 60 }), unit("month", { $gt: 2 }), unit("year")],
		}),
	},
	{
		name: "≥ 1 month",
		rows: [trial("gte", 1, "month")],
		when: inIncoming({
			$or: [
				unit("day", { $gte: 30 }),
				unit("month", { $gte: 1 }),
				unit("year"),
			],
		}),
	},
	{
		name: "has none stores a null trial",
		rows: [{ field: "free_trial", operator: "has_none", value: null }],
		when: inIncoming(noTrial),
	},
	{
		name: "< 60 days is the same filter as < 2 months, so it reads back in months",
		rows: [trial("lt", 60, "day")],
		when: inIncoming({
			$or: [noTrial, unit("day", { $lt: 60 }), unit("month", { $lt: 2 })],
		}),
		readsBack: [trial("lt", 2, "month")],
	},
	{
		name: "< 1 day only lets 'no trial' through, so it's stored and read as has none",
		rows: [trial("lt", 1, "day")],
		when: inIncoming(noTrial),
		readsBack: [{ field: "free_trial", operator: "has_none", value: null }],
	},
	{
		name: "card required and trial end sit beside the duration",
		rows: [
			trial("lte", 14, "day"),
			{ field: "trial_card_required", operator: "is", value: true },
			{ field: "trial_on_end", operator: "is", value: "bill" },
		],
		when: inIncoming({
			$or: [noTrial, unit("day", { $lte: 14 })],
			free_trial: { card_required: true, on_end: "bill" },
		}),
	},
];

test.each(CASES)("$name", ({ rows, when, readsBack = rows }) => {
	const area = "billing_change";
	expect<unknown>(rowsToWhen({ area, groups: [rows] })).toEqual({
		ok: true,
		when,
	});
	expect(whenToRows({ area, when })).toEqual({
		editable: true,
		pinned: null,
		groups: [readsBack],
	});
});

test("a hand-edited $or that isn't an expansion isn't editable", () => {
	const when = inIncoming({ $or: [noTrial, unit("month", { $lt: 2 })] });
	expect(whenToRows({ area: "billing_change", when })).toEqual({
		editable: false,
	});
});
