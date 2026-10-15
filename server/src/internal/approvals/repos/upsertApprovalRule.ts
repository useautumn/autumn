import {
	type AppEnv,
	type ApprovalRuleWithSubjects,
	approvalRuleSubjects,
	approvalRules,
	approvalRuleVersions,
	ErrCode,
	RecaseError,
	type UpsertApprovalRule,
} from "@autumn/shared";
import { and, eq, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Creates or updates a rule, replaces its subjects and snapshots the new version, atomically. */
export const upsertApprovalRule = async ({
	db,
	orgId,
	env,
	rule,
	userId,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	rule: UpsertApprovalRule;
	userId: string;
}): Promise<ApprovalRuleWithSubjects> =>
	db.transaction(async (transaction) => {
		const tx = transaction as unknown as DrizzleCli;
		const { subjects, ...fields } = rule;

		const [saved] = await tx
			.insert(approvalRules)
			.values({
				...fields,
				org_id: orgId,
				env,
				created_by: userId,
				updated_by: userId,
			})
			.onConflictDoUpdate({
				target: approvalRules.id,
				set: {
					name: fields.name,
					actions: fields.actions,
					when: fields.when,
					note: fields.note,
					enabled: fields.enabled,
					version: sql`${approvalRules.version} + 1`,
					updated_by: userId,
					updated_at: Date.now(),
				},
				// An id owned by another org or env must never be overwritten.
				setWhere: and(
					eq(approvalRules.org_id, orgId),
					eq(approvalRules.env, env),
				),
			})
			.returning();

		if (!saved) {
			throw new RecaseError({
				message: `Approval rule ${rule.id} not found`,
				code: ErrCode.InvalidRequest,
				statusCode: 404,
			});
		}

		await tx
			.delete(approvalRuleSubjects)
			.where(eq(approvalRuleSubjects.rule_id, saved.id));
		if (subjects.length > 0) {
			await tx.insert(approvalRuleSubjects).values(
				subjects.map((subject) => ({
					...subject,
					rule_id: saved.id,
					org_id: orgId,
				})),
			);
		}

		await tx.insert(approvalRuleVersions).values({
			rule_id: saved.id,
			org_id: orgId,
			version: saved.version,
			snapshot: {
				name: saved.name,
				actions: saved.actions,
				when: saved.when,
				note: saved.note,
				enabled: saved.enabled,
				subjects,
			},
			created_by: userId,
		});

		return { ...saved, subjects };
	});
