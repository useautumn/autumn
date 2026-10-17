import {
	type ApprovalRuleWithSubjects,
	approvalRules,
} from "@autumn/shared/models/approvalModels/index";
import { eq, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { listApprovalRules } from "./listApprovalRules.js";
import { lockOrgApprovalRules } from "./lockOrgApprovalRules.js";

export type ReorderApprovalRulesResult =
	| { ok: true; rules: ApprovalRuleWithSubjects[] }
	| { ok: false; missing: string[]; unknown: string[]; duplicates: string[] };

const findIdMismatches = ({
	ids,
	existingIds,
}: {
	ids: string[];
	existingIds: string[];
}) => ({
	missing: existingIds.filter((id) => !ids.includes(id)),
	unknown: ids.filter((id) => !existingIds.includes(id)),
	duplicates: [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))],
});

/**
 * Sets the org's list order from the full id list, positions 0..n-1. The id check runs
 * under the org lock, so a rule created meanwhile can't be left out. Positions aren't versioned.
 */
export const reorderApprovalRules = async ({
	db,
	orgId,
	ids,
}: {
	db: DrizzleCli;
	orgId: string;
	ids: string[];
}): Promise<ReorderApprovalRulesResult> =>
	db.transaction(async (transaction) => {
		const tx = transaction as unknown as DrizzleCli;
		await lockOrgApprovalRules({ db: tx, orgId });

		const existing = await tx
			.select({ id: approvalRules.id })
			.from(approvalRules)
			.where(eq(approvalRules.org_id, orgId));
		const mismatches = findIdMismatches({
			ids,
			existingIds: existing.map((rule) => rule.id),
		});
		const listMatches = Object.values(mismatches).every(
			(list) => list.length === 0,
		);
		if (!listMatches) return { ok: false, ...mismatches };

		if (ids.length > 0) {
			const positions = sql.join(
				ids.map((id, position) => sql`(${id}, ${position}::integer)`),
				sql`, `,
			);
			await tx.execute(sql`
				UPDATE approval_rules SET position = v.position
				FROM (VALUES ${positions}) AS v(id, position)
				WHERE approval_rules.id = v.id AND approval_rules.org_id = ${orgId}
			`);
		}
		return { ok: true, rules: await listApprovalRules({ db: tx, orgId }) };
	});
