/**
 * Contract: Balances rules pin a Feature row above the groups. It's required,
 * never offered inside a group, and saved at the top of `when`.
 */

import { describe, expect, test } from "bun:test";
import type { ApprovalAction } from "@autumn/shared";
import {
	editorValuesToParams,
	emptyEditorValues,
	type RuleEditorValues,
	whenValuesFor,
} from "@/views/settings/sections/approvals/editor/ruleEditorValues";
import { ruleFieldRegistry } from "@/views/settings/sections/approvals/editor/ruleFieldRegistry";

const balancesRule = (actions: ApprovalAction[]): RuleEditorValues => ({
	...emptyEditorValues(),
	name: "Credit grants",
	subjects: [{ type: "everyone" as const }],
	actions,
	...whenValuesFor({ actions }),
});

describe("editor required Feature", () => {
	test.each<ApprovalAction>(["balances.create", "balances.update"])(
		"%s starts with an empty pinned Feature row",
		(action) => {
			expect(whenValuesFor({ actions: [action] })).toEqual({
				pinned: { field: "feature", operator: "is", values: [] },
				groups: [],
			});
		},
	);

	test("other areas have no pinned row", () => {
		expect(whenValuesFor({ actions: ["billing.attach"] }).pinned).toBeNull();
	});

	test.each<[ApprovalAction, string]>([
		["balances.create", "balance_create"],
		["balances.update", "balance_update"],
	])("%s never offers Feature inside a group", (_action, area) => {
		const fields = ruleFieldRegistry({
			area: area as "balance_create" | "balance_update",
		}).fields.map((field) => field.path);
		expect(fields).not.toContain("feature");
		expect(fields).toContain("included_grant");
	});

	test("saving without a feature flags the pinned row", () => {
		expect(
			editorValuesToParams({ values: balancesRule(["balances.create"]) }),
		).toEqual({
			ok: false,
			issues: [
				{
					group: "pinned",
					row: 0,
					message: "Choose a value for this condition.",
				},
			],
		});
	});

	test("a chosen feature is saved at the top of `when`, beside the groups", () => {
		const values: RuleEditorValues = {
			...balancesRule(["balances.create"]),
			pinned: { field: "feature", operator: "is", values: ["messages"] },
			groups: [
				{
					rules: [
						{ field: "included_grant", operator: "lte", values: ["100"] },
					],
				},
			],
		};
		const result = editorValuesToParams({ values });
		expect(result.ok && result.params.when).toEqual({
			feature_id: "messages",
			included_grant: { $lte: 100 },
		});
	});

	test("an unfinished row is flagged on its own group and row", () => {
		const values: RuleEditorValues = {
			...balancesRule(["balances.create"]),
			pinned: { field: "feature", operator: "is", values: ["messages"] },
			groups: [
				{
					rules: [
						{ field: "included_grant", operator: "lte", values: ["100"] },
					],
				},
				{
					rules: [
						{ field: "unlimited", operator: "is", values: ["true"] },
						{ field: "included_grant", operator: "lte", values: [] },
					],
				},
			],
		};
		expect(editorValuesToParams({ values })).toEqual({
			ok: false,
			issues: [
				{ group: 1, row: 1, message: "Choose a value for this condition." },
			],
		});
	});
});
