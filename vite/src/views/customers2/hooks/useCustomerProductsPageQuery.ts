import {
	CUSTOMER_PRODUCTS_DEFAULT_LIMIT,
	type CustomerProductsPage,
} from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { throwBackendError } from "@/utils/genUtils";
import type {
	CustomerProductsKindFilter,
	CustomerProductsPageSize,
} from "./useCustomerProductsTableState";

export function useCustomerProductsPageQuery({
	cursor,
	pageSize,
	showExpired,
	kind,
	initialPage,
}: {
	cursor: string;
	pageSize: CustomerProductsPageSize;
	showExpired: boolean;
	kind: CustomerProductsKindFilter;
	initialPage?: CustomerProductsPage;
}) {
	const { customer_id } = useParams();
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const { entityId } = useEntity();

	const isUnfilteredFirstPage =
		cursor === "" &&
		kind === "all" &&
		!showExpired &&
		!entityId &&
		pageSize === CUSTOMER_PRODUCTS_DEFAULT_LIMIT;
	const seedPage = isUnfilteredFirstPage ? initialPage : undefined;

	const fetcher = async (): Promise<CustomerProductsPage> => {
		try {
			const { data } = await axiosInstance.get(
				`/customers/${customer_id}/products`,
				{
					params: {
						start_cursor: cursor,
						limit: pageSize,
						show_expired: showExpired,
						...(kind !== "all" ? { kind } : {}),
						...(entityId ? { entity_id: entityId } : {}),
					},
				},
			);
			return data as CustomerProductsPage;
		} catch (error) {
			throwBackendError(error);
			return { list: [], next_cursor: null, total_count: 0 };
		}
	};

	const { data, isLoading, isFetching, isPlaceholderData, error, refetch } =
		useQuery({
			queryKey: buildKey([
				"customer-products",
				customer_id,
				cursor,
				pageSize,
				showExpired,
				kind,
				entityId,
			]),
			queryFn: fetcher,
			enabled: !!customer_id,
			initialData: seedPage,
			placeholderData: keepPreviousData,
		});

	return {
		products: data?.list ?? [],
		nextCursor: data?.next_cursor ?? null,
		totalCount: data?.total_count ?? 0,
		isLoading,
		isTransitioning: isFetching && isPlaceholderData,
		error,
		refetch,
	};
}
