import { useQuery } from "@tanstack/react-query";
import { fetchFeatures, fetchPlans } from "../api/endpoints/index.js";
import { AppEnv, getKey } from "../env/index.js";

interface ConfigCounts {
	plansCount: number;
	featuresCount: number;
}

export function useConfigCounts() {
	return useQuery<ConfigCounts>({
		queryKey: ["configCounts"],
		queryFn: async () => {
			const sandboxKey = getKey(AppEnv.Sandbox);
			const [features, plans] = await Promise.all([
				fetchFeatures({ secretKey: sandboxKey }),
				fetchPlans({ secretKey: sandboxKey }),
			]);

			return {
				featuresCount: features.length,
				plansCount: plans.length,
			};
		},
	});
}
