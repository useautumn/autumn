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
import {
	type CustomerProductsKindFilter,
	type CustomerProductsPageSize,
	type CustomerProductsStatusOption,
	isDefaultProductStatuses,
} from "./useCustomerProductsTableState";

export function useCustomerProductsPageQuery({
	cursor,
	pageSize,
	statuses,
	kind,
	initialPage,
}: {
	cursor: string;
	pageSize: CustomerProductsPageSize;
	statuses: CustomerProductsStatusOption[];
	kind: CustomerProductsKindFilter;
	initialPage?: CustomerProductsPage;
}) {
	const { customer_id } = useParams();
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const { entityId } = useEntity();

	const status = statuses.length === 1 ? statuses[0] : "all";

	const isUnfilteredFirstPage =
		cursor === "" &&
		kind === "all" &&
		isDefaultProductStatuses(statuses) &&
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
						status,
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
				"customer",
				customer_id,
				"products",
				cursor,
				pageSize,
				status,
				kind,
				entityId,
			]),
			queryFn: fetcher,
			enabled: !!customer_id,
			initialData: seedPage,
			initialDataUpdatedAt: 0,
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
