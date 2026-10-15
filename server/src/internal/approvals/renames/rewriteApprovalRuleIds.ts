import { isDeepStrictEqual } from "node:util";
import { AppEnv } from "@autumn/shared";
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

	const rules = await listRulesMentioningId({
		db: ctx.db,
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
	if (rewrites.length === 0) return;

	await Promise.all(
		rewrites.map(({ ruleId, when }) =>
			updateRuleWhen({ db: ctx.db, orgId: ctx.org.id, ruleId, when }),
		),
	);
	await clearApprovalRulesCache({ orgId: ctx.org.id, env: AppEnv.Live });
};
