import {
	type ApprovalRule,
	approvalRuleIssuesToError,
	CreateApprovalRuleParamsSchema,
	validateApprovalRule,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { clearApprovalRulesCache } from "@/external/redis/actions/approvalRulesCache/approvalRulesCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { generateId } from "@/utils/genUtils.js";
import { handleRuleEditorErrors } from "../errors/handleRuleEditorErrors.js";
import { handleUnknownRuleFieldErrors } from "../errors/handleUnknownRuleFieldErrors.js";
import { approvalRuleRepo } from "../repos/index.js";
import { lockOrgApprovalRules } from "../repos/lockOrgApprovalRules.js";
import { approvalRuleParamsToRow } from "../utils/approvalRuleParamsToRow.js";
import { handleUnsavableRuleErrors } from "./handleUnsavableRuleErrors.js";
import { toApprovalRules } from "./toApprovalRules.js";

/** Appends a rule to the end of the org's list as version 1. */
export const createApprovalRule = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: unknown;
}): Promise<ApprovalRule> => {
	const { db, org } = ctx;
	const editorId = handleRuleEditorErrors({ ctx });
	handleUnknownRuleFieldErrors({
		params,
		fields: Object.keys(CreateApprovalRuleParamsSchema.shape),
	});
	const validated = validateApprovalRule({ rule: params });
	if (!validated.ok)
		throw approvalRuleIssuesToError({ issues: validated.issues });

	const row = await db.transaction(async (transaction) => {
		const tx = transaction as unknown as DrizzleCli;
		await lockOrgApprovalRules({ db: tx, orgId: org.id });
		await handleUnsavableRuleErrors({
			db: tx,
			orgId: org.id,
			rule: validated.rule,
		});
		return approvalRuleRepo.insert({
			db: tx,
			orgId: org.id,
			rule: {
				id: generateId("apr"),
				...approvalRuleParamsToRow({ rule: validated.rule }),
			},
			userId: editorId,
		});
	});
	await clearApprovalRulesCache({ orgId: org.id });

	const [rule] = await toApprovalRules({ db, rows: [row] });
	return rule;
};
