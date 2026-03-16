import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchPlans } from "../api/endpoints/plans.js";
import { AppEnv } from "../env/detect.js";
import { getKey } from "../env/keys.js";

/**
 * Options for usePlans hook
 */
export interface UsePlansOptions {
	environment?: AppEnv;
	includeArchived?: boolean;
}

/**
 * TanStack Query hook for fetching all plans
 * Plans API returns all plans in one call (no server pagination)
 * Use useLocalPagination for client-side pagination/filtering
 */
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

/**
 * Options for useLocalPagination hook
 */
export interface UseLocalPaginationOptions<T> {
	items: T[];
	pageSize: number;
	searchFn?: (item: T, query: string) => boolean;
}

/**
 * Return type for useLocalPagination hook
 */
export interface UseLocalPaginationReturn<T> {
	/** Items for the current page */
	pageItems: T[];
	/** Current page number (1-indexed) */
	page: number;
	/** Set the current page */
	setPage: (page: number) => void;
	/** Total number of pages */
	totalPages: number;
	/** Whether there are more pages after current */
	hasMore: boolean;
	/** Whether there are pages before current */
	hasPrev: boolean;
	/** Current search query */
	search: string;
	/** Set the search query (resets to page 1) */
	setSearch: (query: string) => void;
	/** Total number of filtered items */
	totalItems: number;
}

/**
 * Hook for managing local pagination and search over an array of items
 * Useful when API returns all data and component handles pagination
 */
export function useLocalPagination<T>({
	items,
	pageSize,
	searchFn,
}: UseLocalPaginationOptions<T>): UseLocalPaginationReturn<T> {
	const [page, setPage] = useState(1);
	const [search, setSearch] = useState("");

	// Filter items based on search query
	const filteredItems = useMemo(() => {
		if (!search.trim() || !searchFn) {
			return items;
		}
		const query = search.trim().toLowerCase();
		return items.filter((item) => searchFn(item, query));
	}, [items, search, searchFn]);

	// Calculate pagination
	const totalItems = filteredItems.length;
	const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

	// Clamp page to valid range
	const clampedPage = Math.min(Math.max(1, page), totalPages);

	// Get items for current page
	const pageItems = useMemo(() => {
		const startIndex = (clampedPage - 1) * pageSize;
		const endIndex = startIndex + pageSize;
		return filteredItems.slice(startIndex, endIndex);
	}, [filteredItems, clampedPage, pageSize]);

	// Handle search changes - reset to page 1
	const handleSetSearch = (query: string) => {
		setSearch(query);
		setPage(1);
	};

	// Handle page changes with bounds checking
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
