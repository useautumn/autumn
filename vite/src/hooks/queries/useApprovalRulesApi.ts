import {
	type ApprovalRulesApi,
	mockApprovalRulesApi,
} from "@/views/settings/sections/approvals/approvalRulesMock";

/** Mocked until the D2 `/approvals/rules` routes merge; swap this return for the axios client then. */
export const useApprovalRulesApi = (): ApprovalRulesApi => mockApprovalRulesApi;
