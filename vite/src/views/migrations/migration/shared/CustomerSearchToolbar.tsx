import { Input } from "@autumn/ui";
import { ListMagnifyingGlassIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import {
	CursorPagination,
	type CursorPaginationState,
	PageSizeSelector,
} from "@/components/general/table";
import { CUSTOMER_LIST_PAGE_SIZE_OPTIONS } from "@/utils/constants/customerListPagination";

export function CustomerSearchToolbar({
	search,
	onSearchChange,
	count,
	pageSize,
	onPageSizeChange,
	pagination,
	nextCursor,
	isLoading = false,
	leading,
	trailing,
}: {
	search: string;
	onSearchChange: (value: string) => void;
	/** Lazily loaded — null renders neutral placeholders instead of blocking. */
	count: number | null;
	pageSize: number;
	onPageSizeChange: (size: number) => void;
	pagination: CursorPaginationState;
	nextCursor: string | null;
	isLoading?: boolean;
	leading?: ReactNode;
	trailing?: ReactNode;
}) {
	const totalPages =
		count !== null ? Math.max(Math.ceil(count / pageSize), 1) : null;

	return (
		<div className="flex items-center gap-2">
			{leading}
			<div className="relative flex items-center flex-1 min-w-0">
				<ListMagnifyingGlassIcon
					size={16}
					className="text-tertiary-foreground absolute left-2.5 pointer-events-none"
				/>
				<Input
					value={search}
					onChange={(e) => onSearchChange(e.target.value)}
					className="pl-8! text-sm"
					placeholder={
						count
							? `Search ${count.toLocaleString()} customers`
							: "Search customers"
					}
				/>
			</div>
			<div className="flex items-center gap-2 shrink-0">
				<CursorPagination
					currentPage={pagination.currentPage}
					totalPages={totalPages}
					canGoPrev={pagination.canPrev}
					canGoNext={Boolean(nextCursor)}
					onPrev={pagination.popCursor}
					onNext={() => nextCursor && pagination.pushCursor(nextCursor)}
					disabled={isLoading}
				/>
				<PageSizeSelector
					pageSize={pageSize}
					options={CUSTOMER_LIST_PAGE_SIZE_OPTIONS}
					onChange={onPageSizeChange}
				/>
				{trailing}
			</div>
		</div>
	);
}
