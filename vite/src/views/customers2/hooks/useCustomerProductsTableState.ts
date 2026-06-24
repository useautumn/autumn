import {
	CUSTOMER_PRODUCTS_DEFAULT_LIMIT,
	CustomerProductKind,
} from "@autumn/shared";
import { parseAsBoolean, parseAsStringEnum, useQueryState } from "nuqs";
import { useCallback, useState } from "react";
import { useCursorPagination } from "@/components/general/table";

export const CUSTOMER_PRODUCTS_PAGE_SIZES = [10, 25, 50, 100] as const;
export type CustomerProductsPageSize =
	(typeof CUSTOMER_PRODUCTS_PAGE_SIZES)[number];

const DEFAULT_PAGE_SIZE: CustomerProductsPageSize =
	CUSTOMER_PRODUCTS_DEFAULT_LIMIT;

export type CustomerProductsKindFilter = CustomerProductKind | "all";

export function useCustomerProductsTableState({
	entityId,
}: {
	entityId: string | null;
}) {
	const [pageSize, setPageSize] =
		useState<CustomerProductsPageSize>(DEFAULT_PAGE_SIZE);

	const [showExpired, setShowExpired] = useQueryState(
		"customerProductsShowExpired",
		parseAsBoolean.withDefault(false),
	);
	const [kind, setKind] = useQueryState(
		"customerProductsKind",
		parseAsStringEnum<CustomerProductsKindFilter>([
			"all",
			CustomerProductKind.Subscription,
			CustomerProductKind.OneOff,
			CustomerProductKind.AddOn,
		]).withDefault("all"),
	);

	const { currentCursor, currentPage, canPrev, pushCursor, popCursor } =
		useCursorPagination({
			pageSize,
			resetKey: `${pageSize}|${showExpired}|${kind}|${entityId ?? ""}`,
		});

	const changePageSize = useCallback(
		(value: CustomerProductsPageSize) => setPageSize(value),
		[],
	);

	return {
		currentCursor,
		page: currentPage,
		canGoBack: canPrev,
		pushCursor,
		popCursor,
		pageSize,
		changePageSize,
		showExpired: showExpired ?? false,
		setShowExpired,
		kind: kind ?? "all",
		setKind,
	};
}
