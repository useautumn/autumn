import { AppEnv } from "@autumn/shared";
import { clearApprovalRulesCache } from "@/external/redis/actions/approvalRulesCache/approvalRulesCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { generateId } from "@/utils/genUtils.js";
import { saveApprovalRule } from "./saveApprovalRule.js";

export const createApprovalRule = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: unknown;
}) => {
	const result = await saveApprovalRule({
		ctx,
		ruleId: generateId("apr"),
		params,
	});
	if (result.ok) {
		await clearApprovalRulesCache({ orgId: ctx.org.id, env: AppEnv.Live });
	}
	return result;
};
