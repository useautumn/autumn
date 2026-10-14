import { useQuery } from "@tanstack/react-query";
import { fetchFeatures } from "../api/endpoints/features.js";
import { AppEnv } from "../env/detect.js";
import { getKey } from "../env/keys.js";

export interface UseFeaturesOptions {
	environment?: AppEnv;
	includeArchived?: boolean;
}

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
