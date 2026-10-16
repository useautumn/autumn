import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useApprovalRulesApi } from "./useApprovalRulesApi";

export const APPROVAL_RULES_KEY = ["approval-rules"] as const;

export const useApprovalRulesQuery = () => {
	const api = useApprovalRulesApi();
	const buildKey = useQueryKeyFactory();
	const { data, isLoading, error } = useQuery({
		queryKey: buildKey(APPROVAL_RULES_KEY),
		queryFn: api.list,
		select: (response) => response.list,
	});

	return { rules: data ?? [], isLoading, error };
};
