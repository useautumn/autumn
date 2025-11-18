import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import SmallSpinner from "@/components/general/SmallSpinner";
import {
	Pagination,
	PaginationContent,
	PaginationItem,
} from "@/components/ui/pagination";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { useCusSearchQuery } from "@/views/customers/hooks/useCusSearchQuery";
import { useCustomersQueryStates } from "@/views/customers/hooks/useCustomersQueryStates";

export function CustomerListPagination() {
	const { isLoading, totalCount } = useCusSearchQuery();
	const { queryStates, setQueryStates } = useCustomersQueryStates();

	const totalPages = Math.ceil((totalCount || 0) / 30);
	const currentPage = Number(queryStates.page) || 1;
	const canGoPrev = currentPage > 1;
	const canGoNext = totalPages > 0 && currentPage < totalPages;

	return (
		<div className="flex justify-center items-center gap-2 text-xs text-t3 shrink-0 select-none">
			{isLoading ? (
				<div className="h-7 flex items-center justify-center">
					<SmallSpinner />
				</div>
			) : (
				<Pagination className="w-fit h-7 text-xs">
					<PaginationContent className="w-full flex justify-between items-center gap-2">
						<PaginationItem>
							<IconButton
								variant="secondary"
								size="default"
								icon={<CaretLeftIcon size={12} weight="bold" />}
								onClick={async (e) => {
									e.preventDefault();
									if (!canGoPrev) return;
									await setQueryStates({
										page: currentPage - 1,
									});
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
								onClick={async (e) => {
									e.preventDefault();
									if (!canGoNext) return;
									await setQueryStates({
										page: currentPage + 1,
									});
								}}
								disabled={!canGoNext}
								className={!canGoNext ? "pointer-events-none opacity-50" : ""}
							/>
						</PaginationItem>
					</PaginationContent>
				</Pagination>
			)}
		</div>
	);
}
