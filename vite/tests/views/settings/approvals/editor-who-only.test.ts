/** Contract: actions with no shared filter fields hide When, show the board's caption and save `filter: null`. */

import { describe, expect, test } from "bun:test";
import type {
	ApprovalAction,
	ApprovalFilterKey,
} from "@/views/settings/sections/approvals/approvalsStub";
import {
	ruleFilterKey,
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
		[["customers.get_or_create"], caption("customer creation")],
		[["rewards.create"], caption("reward creation")],
		[["api_keys.create"], caption("API key creation")],
		[["migrations.create", "migrations.run"], caption("migration")],
		[
			["billing.attach", "billing.cancel"],
			"These actions share no conditions, so the rule applies to every request for them.",
		],
	])("%p hides When", (actions, expected) => {
		expect(ruleFilterKey({ actions })).toBeNull();
		expect(whoOnlyCaption({ actions })).toBe(expected);
	});

	test.each<[ApprovalAction[], ApprovalFilterKey | null]>([
		[["billing.attach", "billing.update"], "billing_change"],
		[["billing.cancel"], "billing_cancel"],
		[["billing.uncancel"], "billing_uncancel"],
		[["invoices.void"], "invoice"],
		[["balances.create"], "balance_create"],
		[["rewards.redeem"], "reward_redeem"],
		[["customers.update", "customers.delete"], "customer_change"],
		[["plans.update"], "plan"],
		[["features.create"], "feature"],
		[[], null],
	])("%p shows When for %s, with no caption", (actions, key) => {
		expect(ruleFilterKey({ actions })).toBe(key);
		expect(whoOnlyCaption({ actions })).toBeNull();
	});

	test("a who-only rule saves with no conditions", () => {
		const values = {
			...emptyEditorValues(),
			name: " Developers create keys ",
			subjects: [{ type: "role" as const, role_id: "developer" }],
			actions: ["api_keys.create" as const],
			filter: { customer: { id: "cus_1" } },
		};
		const result = editorValuesToParams({ values });
		expect(result.params.name).toBe("Developers create keys");
		expect(result.params.filter).toBeNull();
	});
});
