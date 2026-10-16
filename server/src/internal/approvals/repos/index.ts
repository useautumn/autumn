import { deleteApprovalRule } from "./deleteApprovalRule.js";
import { getApprovalRule } from "./getApprovalRule.js";
import { insertApprovalDecision } from "./insertApprovalDecision.js";
import { insertApprovalRule } from "./insertApprovalRule.js";
import { listApprovalRules } from "./listApprovalRules.js";
import { listApprovalRuleVersions } from "./listApprovalRuleVersions.js";
import { reorderApprovalRules } from "./reorderApprovalRules.js";
import { updateApprovalRule } from "./updateApprovalRule.js";

export const approvalRuleRepo = {
	get: getApprovalRule,
	list: listApprovalRules,
	listVersions: listApprovalRuleVersions,
	insert: insertApprovalRule,
	update: updateApprovalRule,
	reorder: reorderApprovalRules,
	delete: deleteApprovalRule,
};

export const approvalDecisionRepo = {
	insert: insertApprovalDecision,
};
