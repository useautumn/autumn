import { isDeepStrictEqual } from "node:util";
import { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { clearApprovalRulesCache } from "@/external/redis/actions/approvalRulesCache/approvalRulesCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { listRulesMentioningId } from "../repos/listRulesMentioningId.js";
import { updateRuleWhen } from "../repos/updateRuleWhen.js";
import { type RenamableIdKey, rewriteWhenIds } from "./rewriteWhenIds.js";

/** Keeps live rules pointing at a renamed plan or feature. Sandbox ids are a separate namespace, so sandbox renames skip. */
export const rewriteApprovalRuleIds = async ({
	ctx,
	key,
	fromId,
	toId,
}: {
	ctx: AutumnContext;
	key: RenamableIdKey;
	fromId: string;
	toId: string;
}) => {
	if (ctx.env !== AppEnv.Live) return;

	// Locked from read to write: parallel renames in one catalog update can touch the same rule.
	const rewroteAny = await ctx.db.transaction(async (transaction) => {
		const tx = transaction as unknown as DrizzleCli;
		const rules = await listRulesMentioningId({
			db: tx,
			orgId: ctx.org.id,
			id: fromId,
		});
		const rewrites = rules
			.map((rule) => ({
				ruleId: rule.id,
				when: rewriteWhenIds({ when: rule.when, key, fromId, toId }),
				previous: rule.when,
			}))
			.filter(({ when, previous }) => !isDeepStrictEqual(when, previous));

		for (const { ruleId, when } of rewrites) {
			await updateRuleWhen({ db: tx, orgId: ctx.org.id, ruleId, when });
		}
		return rewrites.length > 0;
	});
	if (!rewroteAny) return;

	await clearApprovalRulesCache({ orgId: ctx.org.id, env: AppEnv.Live });
};
