import {
	CUSTOMER_PRODUCTS_DEFAULT_LIMIT,
	CustomerProductKind,
} from "@autumn/shared";
import { parseAsArrayOf, parseAsStringEnum, useQueryState } from "nuqs";
import { useCallback, useState } from "react";
import { useCursorPagination } from "@/components/general/table";

export const CUSTOMER_PRODUCTS_PAGE_SIZES = [10, 25, 50, 100] as const;
export type CustomerProductsPageSize =
	(typeof CUSTOMER_PRODUCTS_PAGE_SIZES)[number];

const DEFAULT_PAGE_SIZE: CustomerProductsPageSize =
	CUSTOMER_PRODUCTS_DEFAULT_LIMIT;

export type CustomerProductsKindFilter = CustomerProductKind | "all";

export type CustomerProductsStatusOption = "active" | "expired";

export const DEFAULT_PRODUCT_STATUSES: CustomerProductsStatusOption[] = [
	"active",
];

export const isDefaultProductStatuses = (
	statuses: CustomerProductsStatusOption[],
) => statuses.length === 1 && statuses[0] === "active";

export function useCustomerProductsTableState({
	entityId,
}: {
	entityId: string | null;
}) {
	const [pageSize, setPageSize] =
		useState<CustomerProductsPageSize>(DEFAULT_PAGE_SIZE);

	const [statuses, setStatuses] = useQueryState(
		"customerProductsStatuses",
		parseAsArrayOf(
			parseAsStringEnum<CustomerProductsStatusOption>(["active", "expired"]),
		).withDefault(DEFAULT_PRODUCT_STATUSES),
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
			resetKey: `${pageSize}|${statuses.join(",")}|${kind}|${entityId ?? ""}`,
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
		statuses: statuses ?? DEFAULT_PRODUCT_STATUSES,
		setStatuses,
		kind: kind ?? "all",
		setKind,
	};
}
