import { useQuery } from "@tanstack/react-query";
import { request } from "../api/client.js";
import { AppEnv } from "../env/detect.js";
import { getKey } from "../env/keys.js";

interface ListCustomersResponse {
	list: unknown[];
	has_more: boolean;
	offset: number;
	limit: number;
	total: number;
}

/**
 * Hook to check if the organization has at least one customer.
 * Uses a minimal query (limit: 1) to be efficient.
 */
export function useHasCustomers(environment: AppEnv = AppEnv.Sandbox) {
	return useQuery({
		queryKey: ["hasCustomers", environment],
		queryFn: async () => {
			const secretKey = getKey(environment);

			const response = await request<ListCustomersResponse>({
				method: "POST",
				path: "/v1/customers/list",
				secretKey,
				body: {
					limit: 1,
					offset: 0,
				},
			});

			return {
				hasCustomers: response.list.length > 0,
			};
		},
		staleTime: 30_000,
	});
}
