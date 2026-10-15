import { AppEnv, type ApprovalRule } from "@autumn/shared";
import {
	getCachedApprovalRules,
	setCachedApprovalRules,
} from "@/external/redis/actions/approvalRulesCache/approvalRulesCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { listApprovalRules } from "./listApprovalRules.js";

/** The org's enabled live rules, read through a cache that every rule write clears. */
export const getOrgApprovalRules = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<ApprovalRule[]> => {
	const cacheParams = {
		orgId: ctx.org.id,
		env: AppEnv.Live,
		requestId: ctx.id,
	};
	const cached = await getCachedApprovalRules<ApprovalRule[]>(cacheParams);
	if (cached) return cached;

	const rules = await listApprovalRules({ ctx, enabled: true });
	await setCachedApprovalRules({ ...cacheParams, value: rules });
	return rules;
};
