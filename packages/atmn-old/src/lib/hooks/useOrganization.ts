import { useQuery } from "@tanstack/react-query";
import { fetchOrganizationMe } from "../api/endpoints/index.js";
import { AppEnv, getKey } from "../env/index.js";

export interface OrganizationInfo {
	name: string;
	slug: string;
	environment: "Sandbox" | "Live";
}

export function useOrganization(cwd?: string, environment: AppEnv = AppEnv.Sandbox) {
	return useQuery({
		queryKey: ["organization", cwd, environment],
		queryFn: async (): Promise<OrganizationInfo> => {
			// Checks cwd first, then falls back to process.cwd()
			const secretKey = getKey(environment, cwd);
			const orgData = await fetchOrganizationMe({ secretKey });

			return {
				name: orgData.name,
				slug: orgData.slug,
				environment: environment === AppEnv.Sandbox ? "Sandbox" : "Live",
			};
		},
	});
}
