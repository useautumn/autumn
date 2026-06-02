import type {
	CustomerFilter,
	CustomerWithProducts,
	MigrationItemRun,
} from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
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

export const useMigrationFilterPreview = ({
	filter,
	search = "",
	page = 0,
	pageSize = DEFAULT_PAGE_SIZE,
	migrationId,
	executionStatuses = [],
	migrationRunId,
	migrationRunDryRun,
}: {
	filter: CustomerFilter;
	search?: string;
	page?: number;
	pageSize?: number;
	migrationId?: string;
	executionStatuses?: ExecutionStatus[];
	migrationRunId?: string;
	migrationRunDryRun?: boolean;
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const filterKey = useMemo(() => JSON.stringify(filter), [filter]);
	const executionKey = useMemo(
		() => executionStatuses.slice().sort().join(","),
		[executionStatuses],
	);
	const queryKey = buildKey([
		"migration-filter-preview",
		filterKey,
		search,
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
	});

	return {
		count: query.data?.count ?? null,
		customers: query.data?.customers ?? [],
		isLoading: query.isLoading,
	};
};
