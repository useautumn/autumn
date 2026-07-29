import type { TransitionRuleCarryOverUsages } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";

export interface TransitionRulesResponse {
	carry_over_usages: TransitionRuleCarryOverUsages | null;
}

export const useTransitionRulesQuery = () => {
	const axiosInstance = useAxiosInstance();
	const env = useEnv();

	const { data, isLoading, error } = useQuery({
		queryKey: ["transition-rules", env],
		queryFn: async () => {
			const { data } = await axiosInstance.get(
				"/organization/transition_rules",
			);
			return data as TransitionRulesResponse;
		},
	});

	return { transitionRules: data, isLoading, error };
};
