import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useHotkeys } from "react-hotkeys-hook";
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
import { useCustomerFilters } from "@/views/customers/hooks/useCustomerFilters";

const PAGE_SIZE_OPTIONS = [50, 100, 250, 500];

export function CustomerListPagination() {
	const { totalCount, nextCursor, isFetchingUncached } = useCusSearchQuery();
	const {
		queryStates,
		currentPage,
		pushCursor,
		popCursor,
	} = useCustomerFilters();

	const pageSize = queryStates.pageSize || 50;
	const totalPages = Math.ceil((totalCount || 0) / pageSize);
	const hasPaginationData = totalCount > 0;
	const canGoPrev = currentPage > 1;
	const canGoNext = Boolean(nextCursor);
	const isDisabled = isFetchingUncached;

	useHotkeys(
		"left",
		(e) => {
			if (!canGoPrev) return;
			e.preventDefault();
			popCursor();
		},
		{ enabled: canGoPrev },
	);

	useHotkeys(
		"right",
		(e) => {
			if (!canGoNext || !nextCursor) return;
			e.preventDefault();
			pushCursor(nextCursor);
		},
		{ enabled: canGoNext },
	);

	return (
		<div className="flex justify-center items-center gap-2 text-xs text-tertiary-foreground shrink-0 select-none">
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
								popCursor();
							}}
							disabled={isDisabled || !canGoPrev}
							className={isDisabled || !canGoPrev ? "pointer-events-none opacity-50" : ""}
						/>
					</PaginationItem>
					<PaginationItem className="text-muted-foreground font-medium text-center tabular-nums">
						{hasPaginationData
							? `${currentPage} / ${totalPages}`
							: "..."}
					</PaginationItem>
					<PaginationItem>
						<IconButton
							variant="secondary"
							size="default"
							icon={<CaretRightIcon size={12} weight="bold" />}
							onClick={(e) => {
								e.preventDefault();
								if (!canGoNext || !nextCursor) return;
								pushCursor(nextCursor);
							}}
							disabled={isDisabled || !canGoNext}
							className={isDisabled || !canGoNext ? "pointer-events-none opacity-50" : ""}
						/>
					</PaginationItem>
				</PaginationContent>
			</Pagination>
		</div>
	);
}

export function CustomerListPageSizeSelector() {
	const { queryStates, setFilters } = useCustomerFilters();
	const pageSize = queryStates.pageSize || 50;

	return (
		<Select
			value={pageSize.toString()}
			onValueChange={(value) => {
				setFilters({
					pageSize: Number(value),
				});
			}}
			items={Object.fromEntries(PAGE_SIZE_OPTIONS.map((size) => [size.toString(), size.toString()]))}
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
