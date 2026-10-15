import { queryOptions } from "@tanstack/react-query";
import { parseAsArrayOf, parseAsStringEnum, useQueryState } from "nuqs";
import { useCallback } from "react";
import { customerDataUrl } from "@/boot/bootRequests";
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
						const { data } = await axiosInstance.get(
							customerDataUrl({
								customerId: customerId as string,
								entityId,
								includeExpiredLoose,
							}),
						);
						return data;
					} catch (error) {
						throwBackendError(error);
					}
				},
			}),
		[axiosInstance, buildKey],
	);
};
