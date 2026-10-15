/**
 * Approval rule repo (Track D, D1).
 *
 * Contract:
 * - upsert writes the rule, replaces its subjects and snapshots the version, in one transaction.
 * - Every save increments `version` and adds an `approval_rule_versions` row.
 * - list returns enabled rules for (org, live) that name any of the given subjects,
 *   and the subject lookup uses `idx_approval_rule_subjects_lookup`.
 * - Rules are live-only: a sandbox upsert is rejected and writes nothing.
 */

import { expect, test } from "bun:test";
import {
	AppEnv,
	EVERYONE_SUBJECT_ID,
	type UpsertApprovalRule,
} from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { approvalRuleRepo } from "@/internal/approvals/repos/index.js";
import { selectRuleIdsForSubjects } from "@/internal/approvals/repos/selectRuleIdsForSubjects.js";
import { generateId } from "@/utils/genUtils.js";

const live = { db: ctx.db, orgId: ctx.org.id, env: AppEnv.Live };

const buildRule = (
	overrides: Partial<UpsertApprovalRule> = {},
): UpsertApprovalRule => ({
	id: generateId("apr"),
	name: "Sales trials",
	subjects: [{ subject_type: "role", subject_id: "sales" }],
	actions: ["billing.attach"],
	when: { paid: false },
	note: null,
	enabled: true,
	...overrides,
});

const deleteRules = (ruleIds: string[]) =>
	Promise.all(
		ruleIds.map((ruleId) => approvalRuleRepo.delete({ ...live, ruleId })),
	);

test.concurrent("approval rule repo: each save is a new version", async () => {
	const rule = buildRule();

	try {
		const created = await approvalRuleRepo.upsert({
			...live,
			rule,
			userId: "usr_author",
		});
		expect(created.version).toBe(1);

		const updated = await approvalRuleRepo.upsert({
			...live,
			rule: { ...rule, name: "Sales trials v2" },
			userId: "usr_editor",
		});
		expect(updated).toMatchObject({
			version: 2,
			name: "Sales trials v2",
			created_by: "usr_author",
			updated_by: "usr_editor",
		});

		const versions = await approvalRuleRepo.listVersions({
			...live,
			ruleId: rule.id,
		});
		expect(
			versions.map((v) => [v.version, v.snapshot.name, v.created_by]),
		).toEqual([
			[2, "Sales trials v2", "usr_editor"],
			[1, "Sales trials", "usr_author"],
		]);
	} finally {
		await deleteRules([rule.id]);
	}
});

test.concurrent(
	"approval rule repo: subjects are replaced on update, and delete removes the rule",
	async () => {
		const rule = buildRule({
			subjects: [
				{ subject_type: "role", subject_id: "sales" },
				{ subject_type: "user", subject_id: "usr_john" },
			],
		});

		await approvalRuleRepo.upsert({ ...live, rule, userId: "usr_author" });
		await approvalRuleRepo.upsert({
			...live,
			rule: {
				...rule,
				subjects: [
					{ subject_type: "everyone", subject_id: EVERYONE_SUBJECT_ID },
				],
			},
			userId: "usr_author",
		});

		const stored = await approvalRuleRepo.get({ ...live, ruleId: rule.id });
		expect(stored?.subjects).toEqual([
			{ subject_type: "everyone", subject_id: EVERYONE_SUBJECT_ID },
		]);

		expect(await approvalRuleRepo.delete({ ...live, ruleId: rule.id })).toBe(
			true,
		);
		expect(await approvalRuleRepo.get({ ...live, ruleId: rule.id })).toBe(
			undefined,
		);
	},
);

test.concurrent(
	"approval rule repo: lists enabled rules for a subject through the subject index",
	async () => {
		const role = generateId("role");
		const enabled = buildRule({
			subjects: [{ subject_type: "role", subject_id: role }],
		});
		const disabled = buildRule({
			subjects: [{ subject_type: "role", subject_id: role }],
			enabled: false,
		});
		const otherRole = buildRule({
			subjects: [{ subject_type: "role", subject_id: generateId("role") }],
		});

		try {
			for (const rule of [enabled, disabled, otherRole]) {
				await approvalRuleRepo.upsert({ ...live, rule, userId: "usr_author" });
			}

			const rules = await approvalRuleRepo.list({
				...live,
				enabled: true,
				subjects: [{ subject_type: "role", subject_id: role }],
			});
			expect(rules.map((r) => r.id)).toEqual([enabled.id]);

			// The test db is tiny, so force the planner off seq scans to see which index it can use.
			const plan = await ctx.db.transaction(async (tx) => {
				await tx.execute(sql`SET LOCAL enable_seqscan = off`);
				const query = selectRuleIdsForSubjects({
					db: tx as unknown as DrizzleCli,
					orgId: ctx.org.id,
					subjects: [{ subject_type: "role", subject_id: role }],
				});
				return tx.execute(sql`EXPLAIN ${query}`);
			});
			expect(JSON.stringify(plan)).toContain(
				"idx_approval_rule_subjects_lookup",
			);
		} finally {
			await deleteRules([enabled.id, disabled.id, otherRole.id]);
		}
	},
);

test.concurrent(
	"approval rule repo: rejects a sandbox rule and writes nothing",
	async () => {
		const rule = buildRule();

		const error = await approvalRuleRepo
			.upsert({ ...live, env: AppEnv.Sandbox, rule, userId: "usr_author" })
			.catch((e: Error) => e);
		expect((error as Error).message).toContain("approval_rules_live_only");

		expect(await approvalRuleRepo.get({ ...live, ruleId: rule.id })).toBe(
			undefined,
		);
		expect(
			await approvalRuleRepo.listVersions({ ...live, ruleId: rule.id }),
		).toEqual([]);
	},
);
