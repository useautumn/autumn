import { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { clearApprovalRulesCache } from "@/external/redis/actions/approvalRulesCache/approvalRulesCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { lockApprovalRule } from "../repos/lockApprovalRule.js";
import { getApprovalRule } from "./getApprovalRule.js";
import { saveApprovalRule } from "./saveApprovalRule.js";

/**
 * PATCH semantics: the given fields replace the stored ones, and the merged rule is re-validated whole.
 * The rule stays locked from read to write, so a concurrent edit can't be merged away.
 */
export const updateApprovalRule = async ({
	ctx,
	ruleId,
	params,
}: {
	ctx: AutumnContext;
	ruleId: string;
	params: Record<string, unknown>;
}) => {
	const result = await ctx.db.transaction(async (transaction) => {
		const tx = transaction as unknown as DrizzleCli;
		await lockApprovalRule({
			db: tx,
			orgId: ctx.org.id,
			env: AppEnv.Live,
			ruleId,
		});
		const { name, subjects, actions, when, note, enabled } =
			await getApprovalRule({
				ctx,
				db: tx,
				ruleId,
			});
		return saveApprovalRule({
			ctx,
			db: tx,
			ruleId,
			params: { name, subjects, actions, when, note, enabled, ...params },
		});
	});
	if (result.ok) {
		await clearApprovalRulesCache({ orgId: ctx.org.id, env: AppEnv.Live });
	}
	return result;
};
