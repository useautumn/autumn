import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { getBackendErr } from "@/utils/genUtils";
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
		onError: (error) =>
			toast.error(getBackendErr(error, "Failed to update rule")),
	});
};
