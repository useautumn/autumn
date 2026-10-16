import { useAxiosInstance } from "@/services/useAxiosInstance";
import type {
	ApprovalRule,
	ApprovalRuleUpdateParams,
} from "@/views/settings/sections/approvals/approvalsStub";

export type ApprovalRuleCreateParams = Pick<
	ApprovalRule,
	"name" | "effect" | "subjects" | "actions" | "filter" | "note" | "enabled"
>;

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
		create: async ({ params }: { params: ApprovalRuleCreateParams }) => {
			const { data } = await axiosInstance.post<ApprovalRule>(
				"/approval_rules.create",
				params,
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
		/** Positions follow the order of `ids`, which must name every rule. */
		reorder: async ({ ids }: { ids: string[] }) => {
			const { data } = await axiosInstance.post<{ list: ApprovalRule[] }>(
				"/approval_rules.reorder",
				{ ids },
			);
			return data;
		},
		remove: async ({ id }: { id: string }) => {
			const { data } = await axiosInstance.post<{ success: true }>(
				"/approval_rules.delete",
				{ id },
			);
			return data;
		},
	};
};
