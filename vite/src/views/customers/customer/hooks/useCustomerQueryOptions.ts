import { queryOptions } from "@tanstack/react-query";
import { parseAsArrayOf, parseAsStringEnum, useQueryState } from "nuqs";
import { useCallback } from "react";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { throwBackendError } from "@/utils/genUtils";
import {
	type CustomerProductsStatusOption,
	DEFAULT_PRODUCT_STATUSES,
} from "@/views/customers2/hooks/useCustomerProductsTableState";

/** Same nuqs key as the Plans filter: showing expired plans widens the customer fetch. */
export const useIncludeExpiredLoose = () => {
	const [productStatuses] = useQueryState(
		"customerProductsStatuses",
		parseAsArrayOf(
			parseAsStringEnum<CustomerProductsStatusOption>(["active", "expired"]),
		).withDefault(DEFAULT_PRODUCT_STATUSES),
	);
	return productStatuses.includes("expired");
};

/** Shared by the customer page and the layout, which starts this fetch on a direct load. */
export const useCustomerQueryOptions = () => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	return useCallback(
		({
			customerId,
			entityId,
			includeExpiredLoose,
		}: {
			customerId: string | undefined;
			entityId: string | null;
			includeExpiredLoose: boolean;
		}) =>
			queryOptions({
				queryKey: buildKey([
					"customer",
					customerId,
					entityId,
					includeExpiredLoose,
				]),
				queryFn: async () => {
					try {
						const searchParams = new URLSearchParams();
						if (includeExpiredLoose) {
							searchParams.set("include_expired_loose", "true");
						}
						if (entityId) searchParams.set("entity_id", entityId);
						const query = searchParams.toString();
						const { data } = await axiosInstance.get(
							`/customers/${customerId}${query ? `?${query}` : ""}`,
						);
						return data;
					} catch (error) {
						throwBackendError(error);
					}
				},
				retry: false,
			}),
		[axiosInstance, buildKey],
	);
};
