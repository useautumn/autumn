import { deleteApprovalRule } from "./deleteApprovalRule.js";
import { getApprovalRule } from "./getApprovalRule.js";
import { insertApprovalDecision } from "./insertApprovalDecision.js";
import { listApprovalRules } from "./listApprovalRules.js";
import { listApprovalRuleVersions } from "./listApprovalRuleVersions.js";
import { upsertApprovalRule } from "./upsertApprovalRule.js";

export const approvalRuleRepo = {
	get: getApprovalRule,
	list: listApprovalRules,
	listVersions: listApprovalRuleVersions,
	upsert: upsertApprovalRule,
	delete: deleteApprovalRule,
};

export const approvalDecisionRepo = {
	insert: insertApprovalDecision,
};
