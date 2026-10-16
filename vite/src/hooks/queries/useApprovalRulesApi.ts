import { useAxiosInstance } from "@/services/useAxiosInstance";
import type {
	ApprovalRule,
	ApprovalRuleUpdateParams,
} from "@/views/settings/sections/approvals/approvalsStub";

/** Rule routes always read and write live rules, whatever env the dashboard is in. */
export const useApprovalRulesApi = () => {
	const axiosInstance = useAxiosInstance();
	return {
		list: async () => {
			const { data } = await axiosInstance.post<{ list: ApprovalRule[] }>(
				"/approval_rules.list",
				{},
			);
			return data;
		},
		update: async ({
			id,
			params,
		}: {
			id: string;
			params: ApprovalRuleUpdateParams;
		}) => {
			const { data } = await axiosInstance.post<ApprovalRule>(
				"/approval_rules.update",
				{ id, ...params },
			);
			return data;
		},
	};
};
