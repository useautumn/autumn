import { useQuery } from "@tanstack/react-query";
import { fetchAllCustomers } from "../api/endpoints/customers.js";
import { fetchFeatures } from "../api/endpoints/features.js";
import { fetchOrganizationMe } from "../api/endpoints/index.js";
import { fetchPlans } from "../api/endpoints/plans.js";
import { AppEnv } from "../env/detect.js";
import { getKey } from "../env/index.js";

export interface NukeData {
	orgName: string;
	orgSlug: string;
	customersCount: number;
	plansCount: number;
	featuresCount: number;
}

export function useNukeData() {
	return useQuery({
		queryKey: ["nuke-data"],
		queryFn: async (): Promise<NukeData> => {
			const secretKey = getKey(AppEnv.Sandbox);

			const [org, customers, plans, features] = await Promise.all([
				fetchOrganizationMe({ secretKey }),
				fetchAllCustomers({ secretKey }),
				fetchPlans({ secretKey, includeArchived: true }),
				fetchFeatures({ secretKey }),
			]);

			return {
				orgName: org.name,
				orgSlug: org.slug,
				customersCount: customers.length,
				plansCount: plans.length,
				featuresCount: features.length,
			};
		},
		staleTime: 0,
		retry: 1,
	});
}
