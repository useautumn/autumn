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

const noTrial = { free_trial: null };
const inIncoming = (plan: unknown) => ({ incoming: { $every: plan } });

/** The stored branches for a threshold in days: 30-day months, 365-day years. */
const units = (operator: string, days: number) =>
	(
		[
			["day", days],
			["month", days / 30],
			["year", days / 365],
		] as const
	).map(([type, length]) => ({
		free_trial: {
			duration_type: type,
			duration_length: { [operator]: length },
		},
	}));

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
		when: {
			paid: false,
			incoming: {
				$every: { plan_id: "enterprise", $or: [noTrial, ...units("$lt", 60)] },
			},
		},
	},
	{
		name: "< 45 days keeps days (1.5 months isn't whole)",
		rows: [trial("lt", 45, "day")],
		when: inIncoming({ $or: [noTrial, ...units("$lt", 45)] }),
	},
	{
		name: "≤ 1 year",
		rows: [trial("lte", 1, "year")],
		when: inIncoming({ $or: [noTrial, ...units("$lte", 365)] }),
	},
	{
		name: "> 2 months keeps a year threshold, since lengths can be fractional",
		rows: [trial("gt", 2, "month")],
		when: inIncoming({ $or: units("$gt", 60) }),
	},
	{
		name: "≥ 1 month has no 'no trial' branch",
		rows: [trial("gte", 1, "month")],
		when: inIncoming({ $or: units("$gte", 30) }),
	},
	{
		name: "< 1 day stays a length",
		rows: [trial("lt", 1, "day")],
		when: inIncoming({ $or: [noTrial, ...units("$lt", 1)] }),
	},
	{
		name: "has none stores a null trial",
		rows: [{ field: "free_trial", operator: "has_none", value: null }],
		when: inIncoming(noTrial),
	},
	{
		name: "< 60 days is the same filter as < 2 months, so it reads back in months",
		rows: [trial("lt", 60, "day")],
		when: inIncoming({ $or: [noTrial, ...units("$lt", 60)] }),
		readsBack: [trial("lt", 2, "month")],
	},
	{
		name: "card required and trial end sit beside the duration",
		rows: [
			trial("lte", 14, "day"),
			{ field: "trial_card_required", operator: "is", value: true },
			{ field: "trial_on_end", operator: "is", value: "bill" },
		],
		when: inIncoming({
			$or: [noTrial, ...units("$lte", 14)],
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

test.each([
	[
		"a hand-edited $or that isn't an expansion",
		inIncoming({ $or: [noTrial, units("$lt", 60)[1]] }),
	],
	// S3's design-case fixture has no year branch, so it'd miss a 0.1-year trial.
	[
		"the design-case fixture without a year branch",
		rules.enterpriseTrials().when,
	],
])("%s isn't editable", (_name, when) => {
	expect(whenToRows({ area: "billing_change", when })).toEqual({
		editable: false,
	});
});
