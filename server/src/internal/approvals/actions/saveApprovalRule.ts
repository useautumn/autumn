import {
	AppEnv,
	type ApprovalRule,
	type ApprovalRuleIssue,
	validateApprovalRule,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { handleRuleAuthorErrors } from "../errors/handleRuleAuthorErrors.js";
import { approvalRuleRepo } from "../repos/index.js";
import { ruleSubjectToRow } from "../utils/ruleSubjectToRow.js";
import { uniqueSubjectRows } from "../utils/uniqueSubjectRows.js";
import { toApprovalRules } from "./toApprovalRules.js";

export type SaveApprovalRuleResult =
	| { ok: true; rule: ApprovalRule }
	| { ok: false; issues: ApprovalRuleIssue[] };

/** Validates and saves a whole rule as the caller; returns the row this save wrote. */
export const saveApprovalRule = async ({
	ctx,
	db = ctx.db,
	ruleId,
	params,
}: {
	ctx: AutumnContext;
	/** The caller's transaction, when it holds a lock on the rule. */
	db?: DrizzleCli;
	ruleId: string;
	params: unknown;
}): Promise<SaveApprovalRuleResult> => {
	const userId = handleRuleAuthorErrors({ userId: ctx.userId });
	const validation = validateApprovalRule(params);
	if (!validation.ok) return validation;

	const { subjects, ...fields } = validation.rule;
	const saved = await approvalRuleRepo.upsert({
		db,
		orgId: ctx.org.id,
		env: AppEnv.Live,
		userId,
		rule: {
			...fields,
			id: ruleId,
			subjects: uniqueSubjectRows({
				rows: subjects.map((subject) => ruleSubjectToRow({ subject })),
			}),
		},
	});

	const [rule] = await toApprovalRules({ db, rows: [saved] });
	return { ok: true, rule };
};
