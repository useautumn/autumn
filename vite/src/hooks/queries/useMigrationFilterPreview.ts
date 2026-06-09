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
	count: number;
	customers: MigrationPreviewCustomer[];
	page: number;
	pageSize: number;
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
	page = 0,
	pageSize = DEFAULT_PAGE_SIZE,
	migrationId,
	executionStatuses = [],
	migrationRunId,
	migrationRunDryRun,
	isActive = false,
}: {
	filter: CustomerFilter;
	search?: string;
	customerFilters?: CustomerListFilters;
	page?: number;
	pageSize?: number;
	migrationId?: string;
	executionStatuses?: ExecutionStatus[];
	migrationRunId?: string;
	migrationRunDryRun?: boolean;
	isActive?: boolean;
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
	const queryKey = buildKey([
		"migration-filter-preview",
		filterKey,
		search,
		customerFiltersKey,
		page,
		pageSize,
		migrationId,
		executionKey,
		migrationRunId,
		migrationRunDryRun,
	]);

	const query = useQuery<FilterPreviewResponse>({
		queryKey,
		queryFn: async () => {
			const { data } = await axiosInstance.post<FilterPreviewResponse>(
				"/migrations.filter.preview",
				{
					filter,
					search,
					customerFilters,
					page,
					pageSize,
					migrationId,
					executionStatuses,
					migrationRunId,
					migrationRunDryRun,
				},
			);
			return data;
		},
		staleTime: 500,
		placeholderData: keepPreviousData,
		refetchInterval: isActive ? ACTIVE_POLL_MS : false,
	});

	return {
		count: query.data?.count ?? null,
		customers: query.data?.customers ?? [],
		isLoading: query.isLoading || query.isPlaceholderData,
	};
};
