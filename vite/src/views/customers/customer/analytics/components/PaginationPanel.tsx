import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import type { AgGridReact } from "ag-grid-react";
import SmallSpinner from "@/components/general/SmallSpinner";
import {
	Pagination,
	PaginationContent,
	PaginationItem,
} from "@/components/ui/pagination";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { useAnalyticsContext } from "../AnalyticsContext";
import { useRawAnalyticsData } from "../hooks/useAnalyticsData";

export default function PaginationPanel() {
	const {
		gridRef,
		currentPage,
		totalPages,
	}: {
		gridRef: React.RefObject<AgGridReact>;
		currentPage: number;
		totalPages: number;
	} = useAnalyticsContext();
	const { queryLoading } = useRawAnalyticsData();

	const handlePageChange = (page: number) => {
		if (gridRef.current) gridRef.current.api.paginationGoToPage(page);
	};

	const handlePreviousPage = () => {
		const api = gridRef.current?.api;
		if (api) {
			const currentPage = api.paginationGetCurrentPage();
			if (currentPage > 0) {
				handlePageChange(currentPage - 1);
			}
		}
	};

	const handleNextPage = () => {
		const api = gridRef.current?.api;
		if (api) {
			const currentPage = api.paginationGetCurrentPage();
			const totalPages = api.paginationGetTotalPages();
			if (currentPage < totalPages - 1) {
				handlePageChange(currentPage + 1);
			}
		}
	};

	// If grid is not initialized yet or loading, show a simplified version
	if (!gridRef.current?.api || queryLoading) {
		return (
			// <div className="flex items-center py-0 h-full">
			// 	<div className="h-7 flex items-center justify-center">
			// 		<SmallSpinner />
			// 	</div>
			// </div>
			null
		);
	}

	const canGoPrev = currentPage > 1;
	const canGoNext = currentPage < totalPages;

	return (
		<div className="flex items-center py-0 h-full">
			<Pagination className="w-fit h-7 text-xs">
				<PaginationContent className="w-full flex justify-between items-center gap-2">
					<PaginationItem>
						<IconButton
							variant="secondary"
							size="default"
							icon={<CaretLeftIcon size={12} weight="bold" />}
							onClick={(e) => {
								e.preventDefault();
								if (!canGoPrev) return;
								handlePreviousPage();
							}}
							disabled={!canGoPrev}
							className={!canGoPrev ? "pointer-events-none opacity-50" : ""}
						/>
					</PaginationItem>
					<PaginationItem className="text-t2 font-medium">
						{currentPage} / {Math.max(totalPages, 1)}
					</PaginationItem>
					<PaginationItem>
						<IconButton
							variant="secondary"
							size="default"
							icon={<CaretRightIcon size={12} weight="bold" />}
							onClick={(e) => {
								e.preventDefault();
								if (!canGoNext) return;
								handleNextPage();
							}}
							disabled={!canGoNext}
							className={!canGoNext ? "pointer-events-none opacity-50" : ""}
						/>
					</PaginationItem>
				</PaginationContent>
			</Pagination>
		</div>
	);
}
