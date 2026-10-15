/**
 * Contract: actions without `when` fields (or actions that share none) hide the
 * When section, show the board's who-only caption and save `when: null`.
 */

import { describe, expect, test } from "bun:test";
import type { ApprovalAction, WhenKey } from "@autumn/shared";
import {
	ruleWhenArea,
	whoOnlyCaption,
} from "@/views/settings/sections/approvals/editor/ruleActions";
import {
	editorValuesToParams,
	emptyEditorValues,
} from "@/views/settings/sections/approvals/editor/ruleEditorValues";

const caption = (noun: string) =>
	`No conditions for this area yet. The rule applies to every ${noun}.`;

describe("editor who-only areas", () => {
	test.each<[ApprovalAction[], string]>([
		[["customers.create"], caption("customer creation")],
		[["rewards.create"], caption("reward creation")],
		[
			["catalog.edit_plans", "catalog.edit_features"],
			caption("plan and feature edit"),
		],
		[["api_keys.create"], caption("API key creation")],
		[["migrations.create", "migrations.run"], caption("migration")],
		[
			["members.invite", "members.change_role"],
			caption("invite and role change"),
		],
		[
			["billing.attach", "billing.cancel"],
			"These actions share no conditions, so the rule applies to every request for them.",
		],
	])("%p hides When", (actions, expected) => {
		expect(ruleWhenArea({ actions })).toBeNull();
		expect(whoOnlyCaption({ actions })).toBe(expected);
	});

	test.each<[ApprovalAction[], WhenKey]>([
		[["billing.attach", "billing.update_subscription"], "billing_change"],
		[["billing.cancel", "billing.uncancel"], "billing_cancel"],
		[["invoices.void"], "invoice"],
		[["balances.create"], "balance_create"],
		[["rewards.apply"], "reward_apply"],
		[["customers.update", "customers.delete"], "customer"],
		[["catalog.edit_plans"], "catalog_plan"],
	])("%p shows When for %s", (actions, area) => {
		expect(ruleWhenArea({ actions })).toBe(area);
		expect(whoOnlyCaption({ actions })).toBeNull();
	});

	test("no actions yet shows neither When nor the caption", () => {
		expect(ruleWhenArea({ actions: [] })).toBeNull();
		expect(whoOnlyCaption({ actions: [] })).toBeNull();
	});

	test("a who-only rule saves with no conditions", () => {
		const result = editorValuesToParams({
			values: {
				...emptyEditorValues(),
				name: " Developers create keys ",
				subjects: [{ type: "role", role: "developer" }],
				actions: ["api_keys.create"],
				note: "Ask an Admin for a key.",
			},
		});
		expect(result).toEqual({
			ok: true,
			params: {
				name: "Developers create keys",
				subjects: [{ type: "role", role: "developer" }],
				actions: ["api_keys.create"],
				when: null,
				note: "Ask an Admin for a key.",
				enabled: true,
			},
		});
	});
});
