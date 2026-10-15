import {
	AppEnv,
	type ApprovalRule,
	type ApprovalRuleIssue,
	validateApprovalRule,
} from "@autumn/shared";
import { clearApprovalRulesCache } from "@/external/redis/actions/approvalRulesCache/approvalRulesCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { handleRuleAuthorErrors } from "../errors/handleRuleAuthorErrors.js";
import { approvalRuleRepo } from "../repos/index.js";
import { ruleSubjectToRow } from "../utils/ruleSubjectToRow.js";
import { getApprovalRule } from "./getApprovalRule.js";

export type SaveApprovalRuleResult =
	| { ok: true; rule: ApprovalRule }
	| { ok: false; issues: ApprovalRuleIssue[] };

/** Validates and saves a whole rule as the caller, then drops the org's cached rules. */
export const saveApprovalRule = async ({
	ctx,
	ruleId,
	params,
}: {
	ctx: AutumnContext;
	ruleId: string;
	params: unknown;
}): Promise<SaveApprovalRuleResult> => {
	const userId = handleRuleAuthorErrors({ userId: ctx.userId });
	const validation = validateApprovalRule(params);
	if (!validation.ok) return validation;

	const { subjects, ...fields } = validation.rule;
	await approvalRuleRepo.upsert({
		db: ctx.db,
		orgId: ctx.org.id,
		env: AppEnv.Live,
		userId,
		rule: {
			...fields,
			id: ruleId,
			subjects: subjects.map((subject) => ruleSubjectToRow({ subject })),
		},
	});
	await clearApprovalRulesCache({ orgId: ctx.org.id, env: AppEnv.Live });

	return { ok: true, rule: await getApprovalRule({ ctx, ruleId }) };
};
