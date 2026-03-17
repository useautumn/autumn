import { useQuery } from "@tanstack/react-query";
import { fetchFeatures } from "../api/endpoints/features.js";
import { AppEnv } from "../env/detect.js";
import { getKey } from "../env/keys.js";

/**
 * Options for useFeatures hook
 */
export interface UseFeaturesOptions {
	environment?: AppEnv;
	includeArchived?: boolean;
}

/**
 * TanStack Query hook for fetching all features
 * Features API returns all features in one call (no server pagination)
 * Use useLocalPagination for client-side pagination/filtering
 */
export function useFeatures({
	environment = AppEnv.Sandbox,
	includeArchived = true,
}: UseFeaturesOptions = {}) {
	return useQuery({
		queryKey: ["features", environment, includeArchived],
		queryFn: async () => {
			const secretKey = getKey(environment);

			return await fetchFeatures({
				secretKey,
				includeArchived,
			});
		},
		staleTime: 30_000,
	});
}
