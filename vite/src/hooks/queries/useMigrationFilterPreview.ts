import type {
	CustomerFilter,
	CustomerWithProducts,
	MigrationItemRun,
} from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { ACTIVE_POLL_MS } from "@/hooks/queries/useMigrationRunsQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { DEFAULT_CUSTOMER_LIST_PAGE_SIZE } from "@/utils/constants/customerListPagination";
import type { ExecutionStatus } from "@/views/migrations/migration/live/ExecutionStatusSubMenu";

interface FilterPreviewResponse {
	count: number | null;
	customers: MigrationPreviewCustomer[];
	next_cursor: string | null;
}

type FilterPreviewRows = FilterPreviewResponse & {
	cursor: string;
};

export type MigrationPreviewCustomer = CustomerWithProducts & {
	migration_item_run?: MigrationItemRun | null;
};

type CustomerListFilters = {
	status?: string[];
	version?: string[];
	none?: boolean;
	processor?: string[];
};

export const useMigrationFilterPreview = ({
	filter,
	search = "",
	customerFilters,
	cursor = "",
	pageSize = DEFAULT_CUSTOMER_LIST_PAGE_SIZE,
	migrationId,
	executionStatuses = [],
	migrationRunId,
	migrationRunDryRun,
	isActive = false,
	includeRows = true,
}: {
	filter: CustomerFilter;
	search?: string;
	customerFilters?: CustomerListFilters;
	cursor?: string;
	pageSize?: number;
	migrationId?: string;
	executionStatuses?: ExecutionStatus[];
	migrationRunId?: string;
	migrationRunDryRun?: boolean;
	isActive?: boolean;
	includeRows?: boolean;
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const filterKey = useMemo(() => JSON.stringify(filter), [filter]);
	const customerFiltersKey = useMemo(
		() => JSON.stringify(customerFilters ?? {}),
		[customerFilters],
	);
	const executionKey = useMemo(
		() => executionStatuses.slice().sort().join(","),
		[executionStatuses],
	);
	const baseKey = [
		"migration-filter-preview",
		filterKey,
		search,
		customerFiltersKey,
		migrationId,
		executionKey,
		migrationRunId,
		migrationRunDryRun,
	] as const;
	const queryKey = buildKey([...baseKey, cursor, pageSize]);

	const query = useQuery<FilterPreviewRows>({
		queryKey,
		queryFn: async ({ signal }) => {
			const { data } = await axiosInstance.post<FilterPreviewResponse>(
				"/migrations.filter.preview",
				{
					filter,
					search,
					customerFilters,
					cursor,
					pageSize,
					migrationId,
					executionStatuses,
					migrationRunId,
					migrationRunDryRun,
					includeCount: false,
				},
				{ signal },
			);
			return { ...data, cursor };
		},
		staleTime: 500,
		placeholderData: keepPreviousData,
		enabled: includeRows,
		refetchInterval: isActive ? ACTIVE_POLL_MS : false,
	});

	const countQuery = useQuery<number | null>({
		queryKey: buildKey(["migration-filter-preview-count", ...baseKey]),
		queryFn: async ({ signal }) => {
			const { data } = await axiosInstance.post<FilterPreviewResponse>(
				"/migrations.filter.preview",
				{
					filter,
					search,
					customerFilters,
					pageSize: 1,
					migrationId,
					executionStatuses,
					migrationRunId,
					migrationRunDryRun,
					countOnly: true,
				},
				{ signal },
			);
			return data.count;
		},
		staleTime: 500,
		placeholderData: keepPreviousData,
		refetchInterval: isActive ? ACTIVE_POLL_MS : false,
	});

	const hasRowsForCursor = !includeRows || query.data?.cursor === cursor;

	return {
		count: countQuery.data ?? null,
		customers: hasRowsForCursor ? (query.data?.customers ?? []) : [],
		nextCursor: hasRowsForCursor ? (query.data?.next_cursor ?? null) : null,
		isLoading: includeRows
			? !hasRowsForCursor || query.isLoading
			: countQuery.isLoading || countQuery.isPlaceholderData,
		isCountLoading: countQuery.isLoading || countQuery.isPlaceholderData,
	};
};
