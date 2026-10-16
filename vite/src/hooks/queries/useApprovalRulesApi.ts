import type { ApprovalRule, UpdateApprovalRuleParams } from "@autumn/shared";
import { useAxiosInstance } from "@/services/useAxiosInstance";

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
		update: async (params: UpdateApprovalRuleParams) => {
			const { data } = await axiosInstance.post<ApprovalRule>(
				"/approval_rules.update",
				params,
			);
			return data;
		},
	};
};
