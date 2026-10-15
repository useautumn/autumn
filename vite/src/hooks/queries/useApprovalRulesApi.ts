import type { ApprovalRule, CreateApprovalRuleParams } from "@autumn/shared";
import { useAxiosInstance } from "@/services/useAxiosInstance";

/** The D2 `/approvals/rules` routes (approvals-api-schema.md §2). */
export const useApprovalRulesApi = () => {
	const axios = useAxiosInstance();

	return {
		list: async () =>
			(await axios.get<{ list: ApprovalRule[] }>("/approvals/rules")).data,
		create: async ({ params }: { params: CreateApprovalRuleParams }) =>
			(await axios.post<ApprovalRule>("/approvals/rules", params)).data,
		update: async ({
			id,
			params,
		}: {
			id: string;
			params: Partial<CreateApprovalRuleParams>;
		}) =>
			(await axios.patch<ApprovalRule>(`/approvals/rules/${id}`, params)).data,
		remove: async ({ id }: { id: string }) =>
			(await axios.delete<{ deleted: true }>(`/approvals/rules/${id}`)).data,
	};
};
