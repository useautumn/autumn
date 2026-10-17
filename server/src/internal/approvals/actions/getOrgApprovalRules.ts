import type { ApprovalRule } from "@autumn/shared";
import {
	getCachedApprovalRules,
	setCachedApprovalRules,
} from "@/external/redis/actions/approvalRulesCache/approvalRulesCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { listApprovalRules } from "./listApprovalRules.js";

/** The org's enabled rules in list order, read through a cache that every rule write invalidates. */
export const getOrgApprovalRules = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<ApprovalRule[]> => {
	const cacheParams = { orgId: ctx.org.id, requestId: ctx.id };
	const cached = await getCachedApprovalRules<ApprovalRule[]>(cacheParams);
	if (cached.value) return cached.value;

	const rules = await listApprovalRules({ ctx, enabled: true });
	await setCachedApprovalRules({
		...cacheParams,
		generation: cached.generation,
		value: rules,
	});
	return rules;
};
