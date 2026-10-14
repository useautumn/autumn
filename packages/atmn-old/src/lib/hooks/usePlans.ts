import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchPlans } from "../api/endpoints/plans.js";
import { AppEnv } from "../env/detect.js";
import { getKey } from "../env/keys.js";

export interface UsePlansOptions {
	environment?: AppEnv;
	includeArchived?: boolean;
}

export function usePlans({
	environment = AppEnv.Sandbox,
	includeArchived = true,
}: UsePlansOptions = {}) {
	return useQuery({
		queryKey: ["plans", environment, includeArchived],
		queryFn: async () => {
			const secretKey = getKey(environment);

			return await fetchPlans({
				secretKey,
				includeArchived,
			});
		},
		staleTime: 30_000,
	});
}

export interface UseLocalPaginationOptions<T> {
	items: T[];
	pageSize: number;
	searchFn?: (item: T, query: string) => boolean;
}

export interface UseLocalPaginationReturn<T> {
	pageItems: T[];
	page: number;
	setPage: (page: number) => void;
	totalPages: number;
	hasMore: boolean;
	hasPrev: boolean;
	search: string;
	setSearch: (query: string) => void;
	totalItems: number;
}

export function useLocalPagination<T>({
	items,
	pageSize,
	searchFn,
}: UseLocalPaginationOptions<T>): UseLocalPaginationReturn<T> {
	const [page, setPage] = useState(1);
	const [search, setSearch] = useState("");

	const filteredItems = useMemo(() => {
		if (!search.trim() || !searchFn) {
			return items;
		}
		const query = search.trim().toLowerCase();
		return items.filter((item) => searchFn(item, query));
	}, [items, search, searchFn]);

	const totalItems = filteredItems.length;
	const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

	const clampedPage = Math.min(Math.max(1, page), totalPages);

	const pageItems = useMemo(() => {
		const startIndex = (clampedPage - 1) * pageSize;
		const endIndex = startIndex + pageSize;
		return filteredItems.slice(startIndex, endIndex);
	}, [filteredItems, clampedPage, pageSize]);

	const handleSetSearch = (query: string) => {
		setSearch(query);
		setPage(1);
	};

	const handleSetPage = (newPage: number) => {
		const boundedPage = Math.min(Math.max(1, newPage), totalPages);
		setPage(boundedPage);
	};

	return {
		pageItems,
		page: clampedPage,
		setPage: handleSetPage,
		totalPages,
		hasMore: clampedPage < totalPages,
		hasPrev: clampedPage > 1,
		search,
		setSearch: handleSetSearch,
		totalItems,
	};
}
