/** Contract: Move up / Move down / To top / To bottom send the full id list, and the list shows rules in that order. */

import { describe, expect, test } from "bun:test";
import type { ApprovalRule } from "@/views/settings/sections/approvals/approvalsStub";
import {
	moveRule,
	type RuleMove,
	sortRulesByIds,
} from "@/views/settings/sections/approvals/moveRule";

const ids = ["a", "b", "c", "d"];

const ruleWith = (id: string, position: number): ApprovalRule => ({
	id,
	name: id,
	effect: "block",
	position,
	subjects: [{ type: "everyone" }],
	actions: ["billing.attach"],
	filter: null,
	note: null,
	enabled: true,
	version: 1,
	updated_by: { user_id: "usr_1", name: "Charlie Lamb" },
	created_at: 0,
	updated_at: 0,
});

describe("rule reorder", () => {
	test.each<[string, RuleMove, string[]]>([
		["b", "up", ["b", "a", "c", "d"]],
		["b", "down", ["a", "c", "b", "d"]],
		["c", "top", ["c", "a", "b", "d"]],
		["b", "bottom", ["a", "c", "d", "b"]],
		["a", "up", ids],
		["a", "top", ids],
		["d", "down", ids],
		["d", "bottom", ids],
	])("%s %s → %p", (id, move, expected) => {
		expect(moveRule({ ids, id, move })).toEqual(expected);
	});

	test("up then down round-trips the order", () => {
		for (const id of ["b", "c"]) {
			const up = moveRule({ ids, id, move: "up" });
			expect(moveRule({ ids: up, id, move: "down" })).toEqual(ids);
		}
	});

	test("the list shows rules in the order sent", () => {
		const rules = ids.map((id, i) => ruleWith(id, i + 1));
		const sent = moveRule({ ids, id: "d", move: "top" });
		expect(sortRulesByIds({ rules, ids: sent }).map(({ id }) => id)).toEqual(
			sent,
		);
	});
});
