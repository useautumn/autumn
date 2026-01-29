import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import SmallSpinner from "@/components/general/SmallSpinner";
import {
	Pagination,
	PaginationContent,
	PaginationItem,
} from "@/components/ui/pagination";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { useCusSearchQuery } from "@/views/customers/hooks/useCusSearchQuery";
import { useCustomersQueryStates } from "@/views/customers/hooks/useCustomersQueryStates";

const PAGE_SIZE_OPTIONS = [50, 100, 250, 500];

export function CustomerListPagination() {
	const { isLoading, totalCount } = useCusSearchQuery();
	const { queryStates, setQueryStates } = useCustomersQueryStates();

	const pageSize = queryStates.pageSize || 50;
	const totalPages = Math.ceil((totalCount || 0) / pageSize);
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

export function CustomerListPageSizeSelector() {
	const { queryStates, setQueryStates } = useCustomersQueryStates();
	const pageSize = queryStates.pageSize || 50;

	return (
		<Select
			value={pageSize.toString()}
			onValueChange={(value) => {
				setQueryStates({
					pageSize: Number(value),
					page: 1,
				});
			}}
		>
			<SelectTrigger className="h-7 w-fit px-2 text-xs">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{PAGE_SIZE_OPTIONS.map((size) => (
					<SelectItem key={size} value={size.toString()}>
						{size}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
