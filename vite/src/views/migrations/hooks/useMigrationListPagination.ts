import type { OnChangeFn, PaginationState } from "@tanstack/react-table";
import { useMemo } from "react";
import {
	DEFAULT_MIGRATION_LIST_PAGE_SIZE,
	MIGRATION_LIST_PAGE_SIZE_OPTIONS,
} from "@/utils/constants/migrationListPagination";
import { useMigrationsQueryState } from "./useMigrationsQueryState";

/**
 * URL-backed pagination for the migration list. Both values are re-derived
 * from the URL every render, so a hand-edited param or a shrinking row count
 * can never strand the table on a page that does not exist.
 */
export const useMigrationListPagination = ({
	rowCount,
}: {
	rowCount: number;
}) => {
	const { queryStates, setQueryStates } = useMigrationsQueryState();

	const pageSize = MIGRATION_LIST_PAGE_SIZE_OPTIONS.includes(
		queryStates.pageSize,
	)
		? queryStates.pageSize
		: DEFAULT_MIGRATION_LIST_PAGE_SIZE;

	const totalPages = Math.max(1, Math.ceil(rowCount / pageSize));
	const currentPage = Math.min(Math.max(queryStates.page, 1), totalPages);

	const pagination = useMemo<PaginationState>(
		() => ({ pageIndex: currentPage - 1, pageSize }),
		[currentPage, pageSize],
	);

	const onPaginationChange: OnChangeFn<PaginationState> = (updater) => {
		const next = typeof updater === "function" ? updater(pagination) : updater;
		setQueryStates({ page: next.pageIndex + 1, pageSize: next.pageSize });
	};

	return {
		pagination,
		onPaginationChange,
		currentPage,
		totalPages,
		pageSize,
		canGoPrev: currentPage > 1,
		canGoNext: currentPage < totalPages,
		goToPrevPage: () => setQueryStates({ page: currentPage - 1 }),
		goToNextPage: () => setQueryStates({ page: currentPage + 1 }),
		changePageSize: (size: number) =>
			setQueryStates({ page: 1, pageSize: size }),
	};
};
