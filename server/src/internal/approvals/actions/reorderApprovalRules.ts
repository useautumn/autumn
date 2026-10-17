import type { ApprovalRule } from "@autumn/shared";
import { clearApprovalRulesCache } from "@/external/redis/actions/approvalRulesCache/approvalRulesCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { handleReorderMismatchErrors } from "../errors/handleReorderMismatchErrors.js";
import { handleRuleEditorErrors } from "../errors/handleRuleEditorErrors.js";
import { approvalRuleRepo } from "../repos/index.js";
import { toApprovalRules } from "./toApprovalRules.js";

/** Sets list order from every rule id; a later position wins within a level. Positions aren't versioned. */
export const reorderApprovalRules = async ({
	ctx,
	ids,
}: {
	ctx: AutumnContext;
	ids: string[];
}): Promise<ApprovalRule[]> => {
	const { db, org } = ctx;
	handleRuleEditorErrors({ ctx });

	const result = await approvalRuleRepo.reorder({ db, orgId: org.id, ids });
	const rows = handleReorderMismatchErrors({ result });
	await clearApprovalRulesCache({ orgId: org.id });
	return toApprovalRules({ db, rows });
};
