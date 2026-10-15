import {
	CUSTOMER_PRODUCTS_DEFAULT_LIMIT,
	type CustomerProductsPage,
} from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { customerProductsPageUrl } from "@/boot/bootRequests";
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
	enabled = true,
	customerId,
}: {
	cursor: string;
	pageSize: CustomerProductsPageSize;
	statuses: CustomerProductsStatusOption[];
	kind: CustomerProductsKindFilter;
	initialPage?: CustomerProductsPage;
	enabled?: boolean;
	/** Defaults to the route's customer; the layout passes it before the route mounts. */
	customerId?: string;
}) {
	const { customer_id: routeCustomerId } = useParams();
	const customer_id = customerId ?? routeCustomerId;
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
				customerProductsPageUrl({
					customerId: customer_id as string,
					cursor,
					pageSize,
					status,
					kind,
					entityId,
				}),
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
			enabled: enabled && !!customer_id,
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
