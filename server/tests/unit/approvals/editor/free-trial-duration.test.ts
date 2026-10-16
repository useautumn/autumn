/**
 * S5 contract: a "Free trial" row is one `duration` matcher (a length and a
 * unit, compared on the calendar), stored on the incoming plan element. A
 * trial is required: there's no implicit "or no trial" branch.
 *
 * Red (before):  the row expands into a `$or` of day / month / year branches.
 * Green (after): each row stores as listed and reads back as the one row.
 */

import { expect, test } from "bun:test";
import {
	type EditorRow,
	type RuleEffect,
	ruleFilterToRows,
	ruleRowsToFilter,
} from "@autumn/shared/api/approvals/editor/index.js";

const shape = "billing_change";
type Unit = "day" | "month" | "year";

const trial = (operator: string, length: number, unit: Unit) =>
	({ field: "free_trial", operator, value: { length, unit } }) as EditorRow;

const every = (plan: unknown) => ({ incoming: { $every: plan } });

const CASES: {
	name: string;
	effect: RuleEffect;
	rows: EditorRow[];
	filter: unknown;
}[] = [
	{
		name: "< 2 months stores one duration matcher and no null branch",
		effect: "allow",
		rows: [trial("lt", 2, "month")],
		filter: every({
			free_trial: { duration: { $lt: { length: 2, unit: "month" } } },
		}),
	},
	{
		name: "< 45 days keeps days",
		effect: "allow",
		rows: [trial("lt", 45, "day")],
		filter: every({
			free_trial: { duration: { $lt: { length: 45, unit: "day" } } },
		}),
	},
	{
		name: "= 1 month stores $eq",
		effect: "allow",
		rows: [trial("eq", 1, "month")],
		filter: every({
			free_trial: { duration: { $eq: { length: 1, unit: "month" } } },
		}),
	},
	{
		name: "has a trial stores $ne null",
		effect: "allow",
		rows: [{ field: "free_trial", operator: "has_any", value: null }],
		filter: every({ free_trial: { $ne: null } }),
	},
	{
		name: "has none stores free_trial: null",
		effect: "allow",
		rows: [{ field: "free_trial", operator: "has_none", value: null }],
		filter: every({ free_trial: null }),
	},
	{
		name: "card required merges into the same free_trial object",
		effect: "allow",
		rows: [
			trial("lte", 1, "year"),
			{ field: "trial_card_required", operator: "is", value: true },
		],
		filter: every({
			free_trial: {
				duration: { $lte: { length: 1, unit: "year" } },
				card_required: true,
			},
		}),
	},
	{
		name: "block: trial ≥ 1 month stores incoming.$some",
		effect: "block",
		rows: [trial("gte", 1, "month")],
		filter: {
			incoming: {
				$some: {
					free_trial: { duration: { $gte: { length: 1, unit: "month" } } },
				},
			},
		},
	},
];

test.each(CASES)("$effect · $name", ({ effect, rows, filter }) => {
	expect<unknown>(ruleRowsToFilter({ shape, effect, groups: [rows] })).toEqual({
		ok: true,
		filter,
	});
	expect(ruleFilterToRows({ shape, effect, filter })).toEqual({
		editable: true,
		pinned: null,
		groups: [rows],
	});
});

test("no trial is allowed through an OR group, the PRD's way", () => {
	const groups = [
		[trial("lt", 2, "month")],
		[{ field: "free_trial", operator: "has_none", value: null } as EditorRow],
	];
	const filter = {
		$or: [
			every({
				free_trial: { duration: { $lt: { length: 2, unit: "month" } } },
			}),
			every({ free_trial: null }),
		],
	};
	expect<unknown>(ruleRowsToFilter({ shape, effect: "allow", groups })).toEqual(
		{ ok: true, filter },
	);
	expect(ruleFilterToRows({ shape, effect: "allow", filter })).toEqual({
		editable: true,
		pinned: null,
		groups,
	});
});

test.each([
	["a fractional length", trial("lt", 0.5, "year")],
	["a zero length", trial("lt", 0, "month")],
	[
		"no length",
		{ field: "free_trial", operator: "lt", value: { unit: "day" } },
	],
	["an unknown unit", trial("lt", 2, "week" as Unit)],
])("%s reports an issue", (_name, row) => {
	expect(
		ruleRowsToFilter({ shape, effect: "allow", groups: [[row as EditorRow]] }),
	).toEqual({
		ok: false,
		issues: [{ group: 0, row: 0, message: expect.any(String) }],
	});
});

test("a stored duration_length / duration_type filter opens read-only", () => {
	const filter = every({
		free_trial: { duration_type: "day", duration_length: { $lt: 60 } },
	});
	expect(ruleFilterToRows({ shape, effect: "allow", filter })).toEqual({
		editable: false,
	});
});
