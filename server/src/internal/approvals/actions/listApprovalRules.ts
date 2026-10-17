import type { ApprovalRule } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { approvalRuleRepo } from "../repos/index.js";
import { toApprovalRules } from "./toApprovalRules.js";

/** The org's rules in list order. */
export const listApprovalRules = async ({
	ctx,
	enabled,
}: {
	ctx: AutumnContext;
	enabled?: boolean;
}): Promise<ApprovalRule[]> => {
	const rows = await approvalRuleRepo.list({
		db: ctx.db,
		orgId: ctx.org.id,
		enabled,
	});
	return toApprovalRules({ db: ctx.db, rows });
};
