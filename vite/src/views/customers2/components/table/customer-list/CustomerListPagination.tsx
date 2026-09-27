import { Table } from "@/components/general/table";
import {
	CUSTOMER_LIST_PAGE_SIZE_OPTIONS,
	DEFAULT_CUSTOMER_LIST_PAGE_SIZE,
} from "@/utils/constants/customerListPagination";
import { useCusSearchQuery } from "@/views/customers/hooks/useCusSearchQuery";
import { useCustomerFilters } from "@/views/customers/hooks/useCustomerFilters";

export function CustomerListPaginationFooter() {
	const { totalCount, totalCountApproximate, nextCursor, isFetchingUncached } =
		useCusSearchQuery();
	const { queryStates, setFilters, currentPage, pushCursor, popCursor } =
		useCustomerFilters();

	const pageSize = queryStates.pageSize || DEFAULT_CUSTOMER_LIST_PAGE_SIZE;
	const totalPages = totalCount > 0 ? Math.ceil(totalCount / pageSize) : null;

	return (
		<Table.PaginationFooter
			className="border-t bg-card px-3 py-2"
			currentPage={currentPage}
			totalPages={totalPages}
			totalCount={totalCount > 0 ? totalCount : undefined}
			isTotalCountApproximate={totalCountApproximate}
			canGoPrev={currentPage > 1}
			canGoNext={Boolean(nextCursor)}
			onPrev={popCursor}
			onNext={() => nextCursor && pushCursor(nextCursor)}
			pageSize={pageSize}
			pageSizeOptions={CUSTOMER_LIST_PAGE_SIZE_OPTIONS}
			onPageSizeChange={(size) => setFilters({ pageSize: size })}
			disabled={isFetchingUncached}
			enableHotkeys
		/>
	);
}
