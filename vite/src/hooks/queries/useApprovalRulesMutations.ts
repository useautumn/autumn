import type { CreateApprovalRuleParams } from "@autumn/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { getBackendErr } from "@/utils/genUtils";
import { invalidRuleIssues } from "@/views/settings/sections/approvals/editor/invalidRuleIssues";
import { useApprovalRulesApi } from "./useApprovalRulesApi";
import { APPROVAL_RULES_KEY } from "./useApprovalRulesQuery";

const useInvalidateApprovalRules = () => {
	const queryClient = useQueryClient();
	const buildKey = useQueryKeyFactory();
	return () =>
		queryClient.invalidateQueries({ queryKey: buildKey(APPROVAL_RULES_KEY) });
};

export const useToggleApprovalRule = () => {
	const api = useApprovalRulesApi();
	const invalidate = useInvalidateApprovalRules();
	return useMutation({
		mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
			api.update({ id, params: { enabled } }),
		onSettled: invalidate,
		onError: () => toast.error("Failed to update rule"),
	});
};

/** `id: null` creates. A 400 `invalid_approval_rule` is shown inline by the editor, not toasted. */
export const useSaveApprovalRule = () => {
	const api = useApprovalRulesApi();
	const invalidate = useInvalidateApprovalRules();
	return useMutation({
		mutationFn: ({
			id,
			params,
		}: {
			id: string | null;
			params: CreateApprovalRuleParams;
		}) => (id ? api.update({ id, params }) : api.create({ params })),
		// Awaiting the refetch keeps the sheet open until the list shows the change.
		onSuccess: async (_rule, { id }) => {
			toast.success(id ? "Rule updated" : "Rule created");
			await invalidate();
		},
		onError: (error) => {
			if (invalidRuleIssues({ error })) return;
			toast.error(getBackendErr(error, "Failed to save rule"));
		},
	});
};

export const useDeleteApprovalRule = () => {
	const api = useApprovalRulesApi();
	const invalidate = useInvalidateApprovalRules();
	return useMutation({
		mutationFn: ({ id }: { id: string }) => api.remove({ id }),
		onSuccess: async () => {
			toast.success("Rule deleted");
			await invalidate();
		},
		onError: (error) =>
			toast.error(getBackendErr(error, "Failed to delete rule")),
	});
};
