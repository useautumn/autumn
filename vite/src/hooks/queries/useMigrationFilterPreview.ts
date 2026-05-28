import type { CustomerFilter, CustomerWithProducts } from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const DEFAULT_PAGE_SIZE = 10;

interface FilterPreviewResponse {
	count: number;
	customers: CustomerWithProducts[];
	page: number;
	pageSize: number;
}

export const useMigrationFilterPreview = ({
	filter,
	search = "",
	page = 0,
	pageSize = DEFAULT_PAGE_SIZE,
	migrationId,
}: {
	filter: CustomerFilter;
	search?: string;
	page?: number;
	pageSize?: number;
	migrationId?: string;
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const filterKey = useMemo(() => JSON.stringify(filter), [filter]);
	const queryKey = buildKey(["migration-filter-preview", filterKey, search, page, pageSize, migrationId]);

	const query = useQuery<FilterPreviewResponse>({
		queryKey,
		queryFn: async () => {
			const { data } = await axiosInstance.post<FilterPreviewResponse>(
				"/migrations.filter.preview",
				{ filter, search, page, pageSize, migrationId },
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
