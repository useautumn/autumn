import {
	type ApprovalRule,
	approvalRuleIssuesToError,
	type UpdateApprovalRuleParams,
	UpdateApprovalRuleParamsSchema,
	validateApprovalRuleUpdate,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { clearApprovalRulesCache } from "@/external/redis/actions/approvalRulesCache/approvalRulesCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { handleApprovalRuleNotFoundErrors } from "../errors/handleApprovalRuleNotFoundErrors.js";
import { handleRuleEditorErrors } from "../errors/handleRuleEditorErrors.js";
import { handleUnknownRuleFieldErrors } from "../errors/handleUnknownRuleFieldErrors.js";
import { approvalRuleRepo } from "../repos/index.js";
import { lockOrgApprovalRules } from "../repos/lockOrgApprovalRules.js";
import { approvalRuleParamsToRow } from "../utils/approvalRuleParamsToRow.js";
import { ruleRowToApprovalRule } from "../utils/ruleRowToApprovalRule.js";
import { handleUnsavableRuleErrors } from "./handleUnsavableRuleErrors.js";
import { toApprovalRules } from "./toApprovalRules.js";

/**
 * Saves the merged rule as the next version, validated whole so new actions re-check the stored filter.
 * The org lock serializes edits: concurrent updates each merge onto the one before.
 */
export const updateApprovalRule = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: { id: string } & Record<string, unknown>;
}): Promise<ApprovalRule> => {
	const { db, org } = ctx;
	const editorId = handleRuleEditorErrors({ ctx });
	handleUnknownRuleFieldErrors({
		params,
		fields: Object.keys(UpdateApprovalRuleParamsSchema.shape),
	});

	const row = await db.transaction(async (transaction) => {
		const tx = transaction as unknown as DrizzleCli;
		await lockOrgApprovalRules({ db: tx, orgId: org.id });
		const current = handleApprovalRuleNotFoundErrors({
			ruleId: params.id,
			rule: await approvalRuleRepo.get({
				db: tx,
				orgId: org.id,
				ruleId: params.id,
			}),
		});

		const validated = validateApprovalRuleUpdate({
			current: ruleRowToApprovalRule({ row: current, userNames: new Map() }),
			patch: params as UpdateApprovalRuleParams,
		});
		if (!validated.ok)
			throw approvalRuleIssuesToError({ issues: validated.issues });
		await handleUnsavableRuleErrors({
			db: tx,
			orgId: org.id,
			rule: validated.rule,
		});

		return approvalRuleRepo.update({
			db: tx,
			orgId: org.id,
			rule: {
				id: params.id,
				...approvalRuleParamsToRow({ rule: validated.rule }),
			},
			userId: editorId,
		});
	});
	await clearApprovalRulesCache({ orgId: org.id });

	const [rule] = await toApprovalRules({
		db,
		rows: [handleApprovalRuleNotFoundErrors({ ruleId: params.id, rule: row })],
	});
	return rule;
};
