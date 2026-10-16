import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { toast } from "sonner";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { getBackendErr } from "@/utils/genUtils";
import {
	type ApprovalRuleCreateParams,
	useApprovalRulesApi,
} from "./useApprovalRulesApi";
import { APPROVAL_RULES_KEY } from "./useApprovalRulesQuery";

export type ApprovalRuleIssue = { path: string; message: string };

/** The server's 400 `invalid_approval_rule` issues, or null for any other error. */
export const invalidRuleIssues = ({ error }: { error: unknown }) => {
	if (!(error instanceof AxiosError)) return null;
	const body = error.response?.data as
		| { code?: string; details?: { issues?: ApprovalRuleIssue[] } }
		| undefined;
	if (body?.code !== "invalid_approval_rule") return null;
	return body.details?.issues ?? [];
};

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
		onError: (error) =>
			toast.error(getBackendErr(error, "Failed to update rule")),
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
			params: ApprovalRuleCreateParams;
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
