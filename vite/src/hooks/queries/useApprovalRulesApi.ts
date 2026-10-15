import type { ApprovalRule, CreateApprovalRuleParams } from "@autumn/shared";
import { useAxiosInstance } from "@/services/useAxiosInstance";

/** Rule routes always read and write live rules, whatever env the dashboard is in. */
export const useApprovalRulesApi = () => {
	const axiosInstance = useAxiosInstance();
	return {
		list: async () => {
			const { data } = await axiosInstance.get<{ list: ApprovalRule[] }>(
				"/approvals/rules",
			);
			return data;
		},
		update: async ({
			id,
			params,
		}: {
			id: string;
			params: Partial<CreateApprovalRuleParams>;
		}) => {
			const { data } = await axiosInstance.patch<ApprovalRule>(
				`/approvals/rules/${id}`,
				params,
			);
			return data;
		},
	};
};
