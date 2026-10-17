const editors =
	"Only owners, admins and secret keys with every scope can call it; anyone else gets `approval_rule_editor_required`.";

export const listApprovalRulesJsDoc = `Lists the organization's approval rules in list order. Within a level (user, role, everyone), a rule later in the list wins.`;

export const getApprovalRuleJsDoc = `Gets one approval rule by ID.`;

export const createApprovalRuleJsDoc = `Creates an approval rule at the end of the list, as version 1. Problems with the rule come back as \`invalid_approval_rule\` with every issue under \`details.issues\`. Rules apply in live only. ${editors}`;

export const updateApprovalRuleJsDoc = `Updates the fields you pass and saves the rule as its next version. The whole rule is checked again, so changing \`actions\` re-checks its \`filter\`. To move a rule, use \`approval_rules.reorder\`. ${editors}`;

export const deleteApprovalRuleJsDoc = `Deletes an approval rule. Its versions stay readable through \`approval_rules.versions.list\`. ${editors}`;

export const reorderApprovalRulesJsDoc = `Sets the list order from every rule ID, first to last. Leaving a rule out or repeating one is \`invalid_approval_rule\`; an unknown ID is \`approval_rule_not_found\`. ${editors}`;

export const listApprovalRuleVersionsJsDoc = `Lists a rule's saved versions, newest first, including after the rule is deleted.`;
