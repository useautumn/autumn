/**
 * Contract: the invoice, reward, customer and catalog areas offer exactly the
 * rows on the "When fields by area" board, and each row round-trips (S5 · E5b–e).
 */

import { describe, expect, test } from "bun:test";
import type { WhenKey } from "@autumn/shared";
import {
	EDITOR_FIELDS,
	rowsToWhen,
	whenToRows,
} from "@autumn/shared/api/approvals/editor/index.js";

const CUSTOMER_ROWS = {
	customer: ["is", "is_not", "is_any_of", "is_none_of"],
	customer_plan: ["has", "doesnt_have", "has_none"],
};
const MONEY = ["eq", "ne", "lt", "lte", "gt", "gte"];
const ID = ["is", "is_not", "is_any_of", "is_none_of"];

const BOARD: Partial<Record<WhenKey, Record<string, string[]>>> = {
	invoice: { ...CUSTOMER_ROWS, total: MONEY, refund: MONEY },
	reward_apply: { ...CUSTOMER_ROWS, reward: ID },
	customer: CUSTOMER_ROWS,
	catalog_plan: { plan: ID },
	catalog_feature: { feature: ID },
};

describe("area When fields match the board", () => {
	test.each(Object.entries(BOARD))("%s", (area, rows) => {
		expect<unknown>(EDITOR_FIELDS[area as WhenKey]).toEqual(rows);
	});

	test.each<[WhenKey, string, string, unknown, unknown]>([
		["invoice", "total", "lte", 100, { total: { $lte: 100 } }],
		[
			"reward_apply",
			"reward",
			"is_none_of",
			["launch20"],
			{ reward_id: { $nin: ["launch20"] } },
		],
		["catalog_plan", "plan", "is", "enterprise", { plan_id: "enterprise" }],
		[
			"catalog_feature",
			"feature",
			"is_any_of",
			["ai_credits", "messages"],
			{ feature_id: { $in: ["ai_credits", "messages"] } },
		],
		[
			"customer",
			"customer",
			"is",
			"acme",
			{ customer: { customer_id: "acme" } },
		],
	])("%s · %s %s round-trips", (area, field, operator, value, when) => {
		const row = { field, operator, value } as never;
		expect<unknown>(rowsToWhen({ area, groups: [[row]] })).toEqual({
			ok: true,
			when,
		});
		expect(whenToRows({ area, when })).toEqual({
			editable: true,
			pinned: null,
			groups: [[row]],
		});
	});
});
