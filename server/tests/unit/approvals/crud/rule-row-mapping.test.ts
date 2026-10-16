/**
 * Rule rows ↔ API rules (Stage 3, D2a): effect, position, filter and role_id come through intact.
 */

import { describe, expect, test } from "bun:test";
import type { RuleSubject } from "@autumn/shared";
import { rowToRuleSubject } from "@/internal/approvals/utils/rowToRuleSubject.js";
import { ruleRowToApprovalRule } from "@/internal/approvals/utils/ruleRowToApprovalRule.js";
import { ruleSubjectToRow } from "@/internal/approvals/utils/ruleSubjectToRow.js";
import { versionRowToApprovalRuleVersion } from "@/internal/approvals/utils/versionRowToApprovalRuleVersion.js";

const snapshot = {
	name: "Sales trials",
	effect: "block" as const,
	position: 3,
	actions: ["billing.attach"],
	filter: { paid: true },
	note: null,
	enabled: true,
	subjects: [{ subject_type: "role" as const, subject_id: "sales" }],
};

describe("rule row mapping", () => {
	test("maps effect, position, filter and role_id", () => {
		const rule = ruleRowToApprovalRule({
			row: {
				...snapshot,
				id: "apr_1",
				org_id: "org_1",
				version: 2,
				created_by: "usr_1",
				updated_by: "usr_1",
				created_at: 1,
				updated_at: 2,
			},
			userNames: new Map([["usr_1", "Ada"]]),
		});
		expect(rule).toMatchObject({
			effect: "block",
			position: 3,
			filter: { paid: true },
			subjects: [{ type: "role", role_id: "sales" }],
			updated_by: { user_id: "usr_1", name: "Ada" },
		});
	});

	test("a version snapshot carries effect, position and filter", () => {
		const version = versionRowToApprovalRuleVersion({
			row: {
				org_id: "org_1",
				rule_id: "apr_1",
				version: 2,
				snapshot,
				created_by: "usr_1",
				created_at: 1,
			},
			userNames: new Map(),
		});
		expect(version.rule).toMatchObject({
			effect: "block",
			position: 3,
			filter: { paid: true },
		});
	});

	test("subjects round-trip", () => {
		const subjects: RuleSubject[] = [
			{ type: "everyone" },
			{ type: "role", role_id: "sales" },
			{ type: "user", user_id: "usr_1" },
		];
		expect(
			subjects.map((subject) =>
				rowToRuleSubject({ row: ruleSubjectToRow({ subject }) }),
			),
		).toEqual(subjects);
	});
});
