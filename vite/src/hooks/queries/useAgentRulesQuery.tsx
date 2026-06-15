import type { AgentRules } from "@autumn/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export interface AgentRulesResponse extends AgentRules {
	metadata: Record<string, unknown>;
	org_id: string;
	org_slug: string | null;
	updated_at: number | null;
}

export const useAgentRulesQuery = () => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const queryClient = useQueryClient();
	const queryKey = buildKey(["agent-rules"]);

	const { data, isLoading, error } = useQuery<AgentRulesResponse>({
		queryKey,
		queryFn: async () => {
			const { data } = await axiosInstance.post<AgentRulesResponse>(
				"/v1/agent.get_rules",
			);
			return data;
		},
	});

	const generate = useMutation({
		mutationFn: async () => {
			const { data } = await axiosInstance.post<AgentRulesResponse>(
				"/v1/agent.generate_rules",
				{},
			);
			return data;
		},
		onSuccess: (rules) => {
			queryClient.setQueryData(queryKey, rules);
		},
	});

	const update = useMutation({
		mutationFn: async (updates: AgentRules) => {
			const { data } = await axiosInstance.post<AgentRulesResponse>(
				"/v1/agent.update_rules",
				updates,
			);
			return data;
		},
		onSuccess: (rules) => {
			queryClient.setQueryData(queryKey, rules);
		},
	});

	return {
		rules: data,
		isLoading,
		error,
		generate: generate.mutateAsync,
		isGenerating: generate.isPending,
		update: update.mutateAsync,
		isUpdating: update.isPending,
	};
};
