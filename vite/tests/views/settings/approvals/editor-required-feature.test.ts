/** Contract: Balances pin a required Feature row above the groups, never inside one, saved at the top of `filter`. */

import { describe, expect, test } from "bun:test";
import type { ApprovalAction } from "@autumn/shared";
import {
	EDITOR_FIELDS,
	type EditorRowIssue,
} from "@autumn/shared/api/approvals/editor/index";
import {
	editorValuesToParams,
	emptyEditorValues,
	whenValuesFor,
} from "@/views/settings/sections/approvals/editor/ruleEditorValues";
import { ruleFieldRegistry } from "@/views/settings/sections/approvals/editor/ruleFieldRegistry";
import type { RuleRow } from "@/views/settings/sections/approvals/editor/ruleRowCodec";

const grant = (value: string[]) => ({
	field: "included_grant" as const,
	operator: "lte" as const,
	values: value,
});

const save = ({
	feature,
	groups,
}: {
	feature: string[];
	groups: RuleRow[][];
}) =>
	editorValuesToParams({
		values: {
			...emptyEditorValues(),
			name: "Credit grants",
			subjects: [{ type: "everyone" }],
			actions: ["balances.create"],
			pinned: { field: "feature", operator: "is", values: feature },
			groups: groups.map((rules, g) => ({
				id: `g${g}`,
				rules: rules.map((row, r) => ({ ...row, id: `r${g}.${r}` })),
			})),
		},
	});

const missing = "Choose a value for this condition.";

describe("editor required Feature", () => {
	test.each<[ApprovalAction, "feature" | null]>([
		["balances.create", "feature"],
		["balances.update", "feature"],
		["billing.attach", null],
	])("%s starts with pinned %s and no groups", (action, field) => {
		const { pinned, groups } = whenValuesFor({ actions: [action] });
		expect(groups).toEqual([]);
		expect(pinned?.field ?? null).toBe(field);
	});

	test.each(["balance_create", "balance_update"] as const)(
		"%s never offers Feature inside a group",
		(shape) => {
			const fields = ruleFieldRegistry({ shape }).fields.map(
				({ path }) => path,
			);
			expect(fields).not.toContain("feature");
			expect(fields).toContain("included_grant");
		},
	);

	test.each<{
		feature: string[];
		groups: RuleRow[][];
		issues: EditorRowIssue[];
	}>([
		{
			feature: [],
			groups: [],
			issues: [{ group: "pinned", row: 0, message: missing }],
		},
		{
			feature: ["messages"],
			groups: [
				[grant(["100"])],
				[{ field: "unlimited", operator: "is", values: ["true"] }, grant([])],
			],
			issues: [{ group: 1, row: 1, message: missing }],
		},
	])(
		"an unfinished row is flagged where it sits: %j",
		({ issues, ...rule }) => {
			expect(save(rule)).toEqual({ ok: false, issues });
		},
	);

	test("a chosen feature is saved at the top of `filter`, beside the groups", () => {
		const result = save({ feature: ["messages"], groups: [[grant(["100"])]] });
		expect(result.ok && result.params.filter).toEqual({
			feature_id: "messages",
			included_grant: { $lte: 100 },
		});
	});

	// S3 rejects {}, $ne and $nin at filter.feature_id, so the pinned row can't offer them.
	test.each(["balance_create", "balance_update"] as const)(
		"%s's Feature only offers is and is any of",
		(shape) => {
			expect(EDITOR_FIELDS[shape].feature).toEqual(["is", "is_any_of"]);
		},
	);
});
