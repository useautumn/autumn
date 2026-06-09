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
import type { ExecutionStatus } from "@/views/migrations/migration/live/ExecutionStatusSubMenu";

const DEFAULT_PAGE_SIZE = 10;

interface FilterPreviewResponse {
	count: number | null;
	customers: MigrationPreviewCustomer[];
	next_cursor: string | null;
}

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
	pageSize = DEFAULT_PAGE_SIZE,
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

	const query = useQuery<FilterPreviewResponse>({
		queryKey,
		queryFn: async () => {
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
			);
			return data;
		},
		staleTime: 500,
		placeholderData: keepPreviousData,
		enabled: includeRows,
		refetchInterval: isActive ? ACTIVE_POLL_MS : false,
	});

	const countQuery = useQuery<number | null>({
		queryKey: buildKey(["migration-filter-preview-count", ...baseKey]),
		queryFn: async () => {
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
			);
			return data.count;
		},
		staleTime: 500,
		placeholderData: keepPreviousData,
		refetchInterval: isActive ? ACTIVE_POLL_MS : false,
	});

	return {
		count: countQuery.data ?? null,
		customers: query.data?.customers ?? [],
		nextCursor: query.data?.next_cursor ?? null,
		isLoading: includeRows
			? query.isLoading || query.isPlaceholderData
			: countQuery.isLoading || countQuery.isPlaceholderData,
		isCountLoading: countQuery.isLoading || countQuery.isPlaceholderData,
	};
};
