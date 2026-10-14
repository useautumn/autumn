import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { request } from "../api/client.js";
import type { ApiCustomer } from "../api/endpoints/customers.js";
import { AppEnv } from "../env/detect.js";
import { getKey } from "../env/keys.js";

export interface ListCustomersResponse {
	list: ApiCustomer[];
	has_more: boolean;
	offset: number;
	limit: number;
	total: number;
}

export interface UseCustomersOptions {
	page: number;
	pageSize?: number;
	environment?: AppEnv;
	search?: string;
}

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
