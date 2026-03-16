import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { request } from "../api/client.js";
import type { ApiCustomer } from "../api/endpoints/customers.js";
import { AppEnv } from "../env/detect.js";
import { getKey } from "../env/keys.js";

/**
 * Response from POST /v1/customers/list
 */
export interface ListCustomersResponse {
	list: ApiCustomer[];
	has_more: boolean;
	offset: number;
	limit: number;
	/** Number of items in CURRENT PAGE only, NOT total in DB */
	total: number;
}

export interface UseCustomersOptions {
	page: number;
	pageSize?: number;
	environment?: AppEnv;
	/** Search query to filter customers by id, name, or email */
	search?: string;
}

/**
 * TanStack Query hook for fetching paginated customers
 */
export function useCustomers({
	page,
	pageSize = 50,
	environment = AppEnv.Sandbox,
	search,
}: UseCustomersOptions) {
	const offset = (page - 1) * pageSize;

	return useQuery({
		queryKey: ["customers", { offset, limit: pageSize, environment, search }],
		queryFn: async () => {
			const secretKey = getKey(environment);

			const body: Record<string | "search", unknown> = {
				limit: pageSize,
				offset,
				search: search?.trim() ?? undefined,
			};

			const response = await request<ListCustomersResponse>({
				method: "POST",
				path: "/v1/customers/list",
				secretKey,
				body,
			});

			return response;
		},
		placeholderData: keepPreviousData,
		staleTime: 30_000,
	});
}
