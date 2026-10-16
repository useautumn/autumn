/** Contract: rules carry an effect (new ones default to "can't"), roles save by id, and the server owns position. */

import { describe, expect, test } from "bun:test";
import type { ApprovalRule } from "@/views/settings/sections/approvals/approvalsStub";
import {
	editorValuesToParams,
	emptyEditorValues,
	ruleToEditorValues,
} from "@/views/settings/sections/approvals/editor/ruleEditorValues";
import { toggleSubject } from "@/views/settings/sections/approvals/editor/useRuleSubjectGroups";

const rule: ApprovalRule = {
	id: "apr_1",
	name: "Sales can attach",
	effect: "allow",
	position: 3,
	subjects: [{ type: "role", role_id: "sales" }],
	actions: ["billing.attach"],
	filter: { incoming: { $every: { free_trial: null } } },
	note: null,
	enabled: true,
	version: 2,
	updated_by: { user_id: "usr_1", name: "Charlie Lamb" },
	created_at: 0,
	updated_at: 0,
};

describe("editor effect", () => {
	test("a new rule defaults to can't and saves its effect without a position", () => {
		const { params } = editorValuesToParams({
			values: {
				...emptyEditorValues(),
				name: "No trials",
				subjects: [{ type: "everyone" }],
				actions: ["billing.attach"],
			},
		});
		expect(params.effect).toBe("block");
		expect(params.filter).toBeNull();
		expect(params).not.toHaveProperty("position");
		expect(params).not.toHaveProperty("when");
	});

	test("editing keeps the stored effect and filter", () => {
		const { params } = editorValuesToParams({
			values: ruleToEditorValues({ rule }),
		});
		expect(params).toEqual({
			name: rule.name,
			effect: "allow",
			subjects: rule.subjects,
			actions: rule.actions,
			filter: rule.filter,
			note: null,
			enabled: true,
		});
	});

	test("picking a role saves its id", () => {
		expect(toggleSubject({ subjects: [], key: "role:sales" })).toEqual([
			{ type: "role", role_id: "sales" },
		]);
		expect(
			toggleSubject({ subjects: rule.subjects, key: "role:sales" }),
		).toEqual([]);
	});
});
