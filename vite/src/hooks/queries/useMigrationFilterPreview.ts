import type {
	CustomerFilter,
	CustomerWithProducts,
	MigrationItemRun,
} from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { ACTIVE_POLL_MS } from "@/hooks/queries/useMigrationRunsQuery";
import { useDebounce } from "@/hooks/useDebounce";
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

const COUNT_DEBOUNCE_MS = 400;
const COUNT_STALE_MS = 60_000;

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

	// Counts are expensive server-side aggregates (seconds on large filtered
	// scopes) and don't change per keystroke: debounce the inputs and drop
	// empty search/list filters so every consumer of the same filter shares
	// ONE request + cache entry, kept fresh for a minute.
	const debouncedFilterKey = useDebounce({
		value: filterKey,
		delayMs: COUNT_DEBOUNCE_MS,
	});
	const debouncedSearch = useDebounce({
		value: search,
		delayMs: COUNT_DEBOUNCE_MS,
	});
	const countFilter = useMemo(
		() => JSON.parse(debouncedFilterKey) as CustomerFilter,
		[debouncedFilterKey],
	);
	const countSearch =
		debouncedSearch.trim() === "" ? undefined : debouncedSearch;
	const countCustomerFilters =
		customerFiltersKey === "{}" ? undefined : customerFilters;

	const countQuery = useQuery<number | null>({
		queryKey: buildKey([
			"migration-filter-preview-count",
			debouncedFilterKey,
			countSearch ?? "",
			customerFiltersKey,
			migrationId,
			executionKey,
			migrationRunId,
			migrationRunDryRun,
		]),
		queryFn: async ({ signal }) => {
			const { data } = await axiosInstance.post<FilterPreviewResponse>(
				"/migrations.filter.preview",
				{
					filter: countFilter,
					search: countSearch,
					customerFilters: countCustomerFilters,
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
		staleTime: COUNT_STALE_MS,
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
