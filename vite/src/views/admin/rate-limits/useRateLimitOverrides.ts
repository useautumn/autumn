import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import type {
	RateLimitOverrideLimits,
	RateLimitOverridesView,
} from "./rateLimitTypes";

const RATE_LIMIT_OVERRIDES_PATH = "/admin/rate-limit-overrides-config";
const RATE_LIMIT_OVERRIDES_QUERY_KEY = ["admin-rate-limit-overrides"];

/** The policy table with its overrides; writes replace the whole S3 config, as the API expects. */
export const useRateLimitOverrides = () => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();

	const query = useQuery<RateLimitOverridesView>({
		queryKey: RATE_LIMIT_OVERRIDES_QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get(RATE_LIMIT_OVERRIDES_PATH);
			return data;
		},
	});

	const save = useMutation({
		mutationFn: async ({ orgs }: { orgs: RateLimitOverrideLimits }) => {
			await axiosInstance.put(RATE_LIMIT_OVERRIDES_PATH, { orgs });
		},
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: RATE_LIMIT_OVERRIDES_QUERY_KEY,
			}),
	});

	return {
		view: query.data,
		isLoading: query.isLoading,
		saveOrgs: save.mutateAsync,
		isSaving: save.isPending,
	};
};
