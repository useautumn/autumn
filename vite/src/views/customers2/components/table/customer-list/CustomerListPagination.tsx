import {
	CursorPagination,
	PageSizeSelector,
} from "@/components/general/table/CursorPagination";
import {
	CUSTOMER_LIST_PAGE_SIZE_OPTIONS,
	DEFAULT_CUSTOMER_LIST_PAGE_SIZE,
} from "@/utils/constants/customerListPagination";
import { useCusSearchQuery } from "@/views/customers/hooks/useCusSearchQuery";
import { useCustomerFilters } from "@/views/customers/hooks/useCustomerFilters";

export function CustomerListPagination() {
	const { totalCount, nextCursor, isFetchingUncached } = useCusSearchQuery();
	const { queryStates, currentPage, pushCursor, popCursor } =
		useCustomerFilters();

	const pageSize = queryStates.pageSize || DEFAULT_CUSTOMER_LIST_PAGE_SIZE;
	const totalPages = totalCount > 0 ? Math.ceil(totalCount / pageSize) : null;

	return (
		<CursorPagination
			currentPage={currentPage}
			totalPages={totalPages}
			canGoPrev={currentPage > 1}
			canGoNext={Boolean(nextCursor)}
			onPrev={popCursor}
			onNext={() => nextCursor && pushCursor(nextCursor)}
			disabled={isFetchingUncached}
			enableHotkeys
		/>
	);
}

export function CustomerListPageSizeSelector() {
	const { queryStates, setFilters } = useCustomerFilters();
	const pageSize = queryStates.pageSize || DEFAULT_CUSTOMER_LIST_PAGE_SIZE;

	return (
		<PageSizeSelector
			pageSize={pageSize}
			options={CUSTOMER_LIST_PAGE_SIZE_OPTIONS}
			onChange={(size) => setFilters({ pageSize: size })}
		/>
	);
}
