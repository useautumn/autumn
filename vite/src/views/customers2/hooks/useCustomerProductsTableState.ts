import { CustomerProductKind } from "@autumn/shared";
import { parseAsBoolean, parseAsStringEnum, useQueryState } from "nuqs";
import { useCallback, useState } from "react";

export const CUSTOMER_PRODUCTS_PAGE_SIZES = [10, 25, 50, 100] as const;
export type CustomerProductsPageSize =
	(typeof CUSTOMER_PRODUCTS_PAGE_SIZES)[number];

const DEFAULT_PAGE_SIZE: CustomerProductsPageSize = 10;

export type CustomerProductsKindFilter = CustomerProductKind | "all";

export function useCustomerProductsTableState() {
	const [cursorStack, setCursorStack] = useState<string[]>([""]);
	const [pageSize, setPageSize] =
		useState<CustomerProductsPageSize>(DEFAULT_PAGE_SIZE);

	const [showExpired, setShowExpiredRaw] = useQueryState(
		"customerProductsShowExpired",
		parseAsBoolean.withDefault(false),
	);
	const [kind, setKindRaw] = useQueryState(
		"customerProductsKind",
		parseAsStringEnum<CustomerProductsKindFilter>([
			"all",
			CustomerProductKind.Subscription,
			CustomerProductKind.OneOff,
			CustomerProductKind.AddOn,
		]).withDefault("all"),
	);

	const resetCursor = useCallback(() => setCursorStack([""]), []);

	const setShowExpired = useCallback(
		(value: boolean) => {
			setShowExpiredRaw(value);
			resetCursor();
		},
		[setShowExpiredRaw, resetCursor],
	);

	const setKind = useCallback(
		(value: CustomerProductsKindFilter) => {
			setKindRaw(value);
			resetCursor();
		},
		[setKindRaw, resetCursor],
	);

	const changePageSize = useCallback(
		(value: CustomerProductsPageSize) => {
			setPageSize(value);
			resetCursor();
		},
		[resetCursor],
	);

	const pushCursor = useCallback((nextCursor: string) => {
		setCursorStack((stack) => [...stack, nextCursor]);
	}, []);

	const popCursor = useCallback(() => {
		setCursorStack((stack) => (stack.length > 1 ? stack.slice(0, -1) : stack));
	}, []);

	const currentCursor = cursorStack[cursorStack.length - 1] ?? "";
	const page = cursorStack.length;

	return {
		currentCursor,
		page,
		canGoBack: cursorStack.length > 1,
		pushCursor,
		popCursor,
		resetCursor,
		pageSize,
		changePageSize,
		showExpired: showExpired ?? false,
		setShowExpired,
		kind: kind ?? "all",
		setKind,
	};
}
