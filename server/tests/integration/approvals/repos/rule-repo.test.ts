/**
 * Approval rule repo (Track D, D1).
 *
 * Contract:
 * - approval_rules has effect, position and filter; neither table has env (rules are live-only by design).
 * - insert appends: position = max + 1 under an org lock, so concurrent inserts never collide.
 * - update bumps version, keeps position, replaces subjects when given, and snapshots the merged rule.
 *   An unknown id returns undefined and writes nothing.
 * - reorder sets positions 0..n-1 from the full id list, or changes nothing when the list doesn't match.
 * - list orders by position; the subject lookup uses idx_approval_rule_subjects_lookup.
 */

import { afterAll, expect, test } from "bun:test";
import { organizations } from "@autumn/shared";
import {
	EVERYONE_SUBJECT_ID,
	type InsertApprovalRule,
} from "@autumn/shared/models/approvalModels/index";
import { insertCopyTestOrg } from "@tests/utils/fixtures/copyEnvFixtures.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { eq, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { approvalRuleRepo } from "@/internal/approvals/repos/index.js";
import { selectRuleIdsForSubjects } from "@/internal/approvals/repos/selectRuleIdsForSubjects.js";
import { generateId } from "@/utils/genUtils.js";

const { db } = ctx;
const orgIds: string[] = [];

/** Positions are per org, so each test gets its own org. */
const freshOrg = async () => {
	const org = await insertCopyTestOrg({ db, name: "approval-rule-repo" });
	orgIds.push(org.id);
	return org.id;
};

afterAll(async () => {
	for (const id of orgIds) {
		await db.delete(organizations).where(eq(organizations.id, id));
	}
});

const buildRule = (
	overrides: Partial<InsertApprovalRule> = {},
): InsertApprovalRule => ({
	id: generateId("apr"),
	name: "Sales trials",
	effect: "allow",
	subjects: [{ subject_type: "role", subject_id: "sales" }],
	actions: ["billing.attach"],
	filter: { paid: false },
	note: null,
	enabled: true,
	...overrides,
});

const insertRule = ({
	orgId,
	rule = buildRule(),
}: {
	orgId: string;
	rule?: InsertApprovalRule;
}) => approvalRuleRepo.insert({ db, orgId, rule, userId: "usr_author" });

const columnsOf = async (table: string) => {
	const rows = await db.execute(
		sql`select column_name from information_schema.columns where table_name = ${table}`,
	);
	return (rows as unknown as { column_name: string }[]).map(
		(r) => r.column_name,
	);
};

test("approval tables: effect, position and filter; no env or when", async () => {
	const rules = await columnsOf("approval_rules");
	expect(rules).toEqual(
		expect.arrayContaining(["effect", "position", "filter"]),
	);
	expect(rules).not.toContain("env");
	expect(rules).not.toContain("when");
	expect(await columnsOf("approval_decisions")).not.toContain("env");
});

test("insert appends each new rule to the end of the list", async () => {
	const orgId = await freshOrg();
	const inserted = [];
	for (let i = 0; i < 3; i++) inserted.push(await insertRule({ orgId }));

	const listed = await approvalRuleRepo.list({ db, orgId });
	expect(listed.map((r) => [r.id, r.position])).toEqual(
		inserted.map((r, i) => [r.id, i]),
	);
	expect(inserted[0]).toMatchObject({ version: 1, effect: "allow" });
});

test("concurrent inserts get distinct positions", async () => {
	const orgId = await freshOrg();
	const inserted = await Promise.all(
		Array.from({ length: 5 }, () => insertRule({ orgId })),
	);
	expect(new Set(inserted.map((r) => r.position)).size).toBe(5);
});

test("update bumps the version, keeps position and snapshots the merged rule", async () => {
	const orgId = await freshOrg();
	await insertRule({ orgId });
	const rule = await insertRule({ orgId });

	const updated = await approvalRuleRepo.update({
		db,
		orgId,
		userId: "usr_editor",
		rule: { id: rule.id, name: "Sales blocks", effect: "block", filter: null },
	});
	expect(updated).toMatchObject({
		version: 2,
		position: 1,
		name: "Sales blocks",
		effect: "block",
		filter: null,
		created_by: "usr_author",
		updated_by: "usr_editor",
		subjects: [{ subject_type: "role", subject_id: "sales" }],
	});

	const versions = await approvalRuleRepo.listVersions({
		db,
		orgId,
		ruleId: rule.id,
	});
	expect(versions.map((v) => [v.version, v.created_by])).toEqual([
		[2, "usr_editor"],
		[1, "usr_author"],
	]);
	expect(versions[0].snapshot).toMatchObject({
		name: "Sales blocks",
		effect: "block",
		position: 1,
		filter: null,
		actions: ["billing.attach"],
	});
});

test("update replaces subjects, an unknown id writes nothing, and delete removes the rule", async () => {
	const orgId = await freshOrg();
	const rule = await insertRule({
		orgId,
		rule: buildRule({
			subjects: [
				{ subject_type: "role", subject_id: "sales" },
				{ subject_type: "user", subject_id: "usr_john" },
			],
		}),
	});

	await approvalRuleRepo.update({
		db,
		orgId,
		userId: "usr_editor",
		rule: {
			id: rule.id,
			subjects: [{ subject_type: "everyone", subject_id: EVERYONE_SUBJECT_ID }],
		},
	});
	expect(
		(await approvalRuleRepo.get({ db, orgId, ruleId: rule.id }))?.subjects,
	).toEqual([{ subject_type: "everyone", subject_id: EVERYONE_SUBJECT_ID }]);

	const ghostId = generateId("apr");
	expect(
		await approvalRuleRepo.update({
			db,
			orgId,
			userId: "usr_editor",
			rule: { id: ghostId, name: "Ghost" },
		}),
	).toBeUndefined();
	expect(
		await approvalRuleRepo.listVersions({ db, orgId, ruleId: ghostId }),
	).toEqual([]);

	expect(await approvalRuleRepo.delete({ db, orgId, ruleId: rule.id })).toBe(
		true,
	);
	expect(
		await approvalRuleRepo.get({ db, orgId, ruleId: rule.id }),
	).toBeUndefined();
});

test("reorder sets positions from the full id list, or changes nothing when it doesn't match", async () => {
	const orgId = await freshOrg();
	const [a, b, c] = [
		await insertRule({ orgId }),
		await insertRule({ orgId }),
		await insertRule({ orgId }),
	];
	const listedIds = async () =>
		(await approvalRuleRepo.list({ db, orgId })).map((r) => r.id);

	const reordered = await approvalRuleRepo.reorder({
		db,
		orgId,
		ids: [c.id, a.id, b.id],
	});
	expect(
		reordered.ok && reordered.rules.map((r) => [r.id, r.position]),
	).toEqual([
		[c.id, 0],
		[a.id, 1],
		[b.id, 2],
	]);
	expect(await listedIds()).toEqual([c.id, a.id, b.id]);

	const mismatched = await approvalRuleRepo.reorder({
		db,
		orgId,
		ids: [a.id, c.id, c.id, "apr_unknown"],
	});
	expect(mismatched).toEqual({
		ok: false,
		missing: [b.id],
		unknown: ["apr_unknown"],
		duplicates: [c.id],
	});
	expect(await listedIds()).toEqual([c.id, a.id, b.id]);
});

test("lists enabled rules for a subject through the subject index", async () => {
	const orgId = await freshOrg();
	const role = generateId("role");
	const enabled = await insertRule({
		orgId,
		rule: buildRule({ subjects: [{ subject_type: "role", subject_id: role }] }),
	});
	await insertRule({
		orgId,
		rule: buildRule({
			subjects: [{ subject_type: "role", subject_id: role }],
			enabled: false,
		}),
	});
	await insertRule({ orgId });

	const rules = await approvalRuleRepo.list({
		db,
		orgId,
		enabled: true,
		subjects: [{ subject_type: "role", subject_id: role }],
	});
	expect(rules.map((r) => r.id)).toEqual([enabled.id]);

	// The test db is tiny, so force the planner off seq scans to see which index it can use.
	const plan = await db.transaction(async (tx) => {
		await tx.execute(sql`SET LOCAL enable_seqscan = off`);
		const query = selectRuleIdsForSubjects({
			db: tx as unknown as DrizzleCli,
			orgId,
			subjects: [{ subject_type: "role", subject_id: role }],
		});
		return tx.execute(sql`EXPLAIN ${query}`);
	});
	expect(JSON.stringify(plan)).toContain("idx_approval_rule_subjects_lookup");
});
