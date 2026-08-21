import {
	type BalanceFilterOp,
	BalanceFilterOpSchema,
	type CustomerListSortBy,
	CustomerListSortBySchema,
	type FeatureBalanceSortBasis,
	FeatureBalanceSortBasisSchema,
	type SortOrder,
	SortOrderSchema,
} from "@autumn/shared";
import {
	parseAsArrayOf,
	parseAsBoolean,
	parseAsInteger,
	parseAsString,
	parseAsStringLiteral,
	useQueryStates,
} from "nuqs";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useOrg } from "@/hooks/common/useOrg";
import { DEFAULT_CUSTOMER_LIST_PAGE_SIZE } from "@/utils/constants/customerListPagination";
import { useEnv } from "@/utils/envUtils";

const FILTERS_KEY_PREFIX = "autumn:customer-filters";

const FILTER_PARAM_KEYS = [
	"q",
	"status",
	"version",
	"none",
	"processor",
	"interval",
	"pageSize",
	"sort",
	"sortBy",
	"sortFeature",
	"sortBasis",
	"balanceFeature",
	"balanceOp",
	"balanceValue",
	"balanceBasis",
	"joinedFrom",
	"joinedTo",
] as const;

type PersistedCustomerFilters = {
	status: string[];
	version: string[];
	none: boolean;
	processor: string[];
	interval: string[];
	pageSize: number;
	sort?: SortOrder;
	sortBy?: CustomerListSortBy;
	sortFeature?: string;
	sortBasis?: FeatureBalanceSortBasis;
	balanceFeature?: string;
	balanceOp?: BalanceFilterOp;
	balanceValue?: string;
	balanceBasis?: FeatureBalanceSortBasis;
	joinedFrom?: number | null;
	joinedTo?: number | null;
};

function getStorageKey({ orgId, env }: { orgId: string; env: string }) {
	return `${FILTERS_KEY_PREFIX}:${orgId}:${env}`;
}

function getSavedFilters({
	orgId,
	env,
}: {
	orgId: string;
	env: string;
}): PersistedCustomerFilters | null {
	try {
		const stored = localStorage.getItem(getStorageKey({ orgId, env }));
		return stored ? JSON.parse(stored) : null;
	} catch {
		return null;
	}
}

function buildRestoredState({
	filters,
}: {
	filters: PersistedCustomerFilters | null;
}) {
	return {
		q: null,
		status: filters?.status?.length ? filters.status : null,
		version: filters?.version?.length ? filters.version : null,
		none: filters?.none ? true : null,
		processor: filters?.processor?.length ? filters.processor : null,
		interval: filters?.interval?.length ? filters.interval : null,
		pageSize:
			filters?.pageSize && filters.pageSize !== DEFAULT_CUSTOMER_LIST_PAGE_SIZE
				? filters.pageSize
				: null,
		sort: filters?.sort === "asc" ? filters.sort : null,
		sortBy:
			filters?.sortBy && filters.sortBy !== "created_at"
				? filters.sortBy
				: null,
		sortFeature: filters?.sortFeature || null,
		sortBasis:
			filters?.sortBasis && filters.sortBasis !== "remaining"
				? filters.sortBasis
				: null,
		balanceFeature: filters?.balanceFeature || null,
		balanceOp: filters?.balanceOp === "<" ? filters.balanceOp : null,
		balanceValue: filters?.balanceValue || null,
		balanceBasis:
			filters?.balanceBasis && filters.balanceBasis !== "remaining"
				? filters.balanceBasis
				: null,
		joinedFrom: filters?.joinedFrom ?? null,
		joinedTo: filters?.joinedTo ?? null,
	};
}

const queryStatesConfig = {
	q: parseAsString.withDefault(""),
	status: parseAsArrayOf(parseAsString).withDefault([]),
	version: parseAsArrayOf(parseAsString).withDefault([]),
	none: parseAsBoolean.withDefault(false),
	processor: parseAsArrayOf(parseAsString).withDefault([]),
	interval: parseAsArrayOf(parseAsString).withDefault([]),
	pageSize: parseAsInteger.withDefault(DEFAULT_CUSTOMER_LIST_PAGE_SIZE),
	sort: parseAsStringLiteral(SortOrderSchema.options).withDefault("desc"),
	sortBy: parseAsStringLiteral(CustomerListSortBySchema.options).withDefault(
		"created_at",
	),
	sortFeature: parseAsString.withDefault(""),
	sortBasis: parseAsStringLiteral(
		FeatureBalanceSortBasisSchema.options,
	).withDefault("remaining"),
	balanceFeature: parseAsString.withDefault(""),
	balanceOp: parseAsStringLiteral(BalanceFilterOpSchema.options).withDefault(
		">",
	),
	// Raw string in the URL; coerced to a number only when the payload is built.
	balanceValue: parseAsString.withDefault(""),
	balanceBasis: parseAsStringLiteral(
		FeatureBalanceSortBasisSchema.options,
	).withDefault("remaining"),
	joinedFrom: parseAsInteger,
	joinedTo: parseAsInteger,
};

type QueryStates = ReturnType<typeof useQueryStates<typeof queryStatesConfig>>;

const BALANCE_VALUE_MULTIPLIERS: Record<string, number> = {
	k: 1e3,
	m: 1e6,
	b: 1e9,
	bn: 1e9,
};

/** Accepts comma-grouped digits and k/M/B/bn shorthand ("10,000", "1.5M");
 * null when the text isn't a number. */
export function parseBalanceValueInput(raw: string): number | null {
	const match = /^(-?[\d,]*\.?\d+)\s*(bn|k|m|b)?$/i.exec(raw.trim());
	if (!match) return null;
	const numeric = Number(match[1].replace(/,/g, ""));
	if (!Number.isFinite(numeric)) return null;
	const suffix = match[2]?.toLowerCase();
	return numeric * (suffix ? BALANCE_VALUE_MULTIPLIERS[suffix] : 1);
}

export function hasActiveBalanceFilter(queryStates: QueryStates[0]) {
	return (
		queryStates.balanceFeature !== "" &&
		parseBalanceValueInput(queryStates.balanceValue) !== null
	);
}

/** Query-key contribution of the balance filter: null while the filter is
 * incomplete so editing op/feature/value doesn't refetch identical results. */
export function balanceFilterQueryKey(queryStates: QueryStates[0]) {
	if (!hasActiveBalanceFilter(queryStates)) return null;
	return `${queryStates.balanceFeature}:${queryStates.balanceBasis}${queryStates.balanceOp}${parseBalanceValueInput(queryStates.balanceValue)}`;
}

/** Query-key contribution of the feature sort: null unless a feature sort is
 * active so basis edits without a sorted feature don't refetch. */
export function featureSortQueryKey(queryStates: QueryStates[0]) {
	if (
		queryStates.sortBy !== "feature_balance" ||
		queryStates.sortFeature === ""
	)
		return null;
	return `${queryStates.sortFeature}:${queryStates.sortBasis}`;
}

export function hasActiveCustomerFilters(queryStates: QueryStates[0]) {
	return (
		queryStates.status.length > 0 ||
		queryStates.version.length > 0 ||
		queryStates.none ||
		queryStates.processor.length > 0 ||
		queryStates.interval.length > 0 ||
		queryStates.joinedFrom !== null ||
		queryStates.joinedTo !== null ||
		hasActiveBalanceFilter(queryStates)
	);
}

export function buildCustomerFilterPayload(queryStates: QueryStates[0]) {
	const { joinedFrom, joinedTo } = queryStates;
	const hasJoinedRange = joinedFrom !== null || joinedTo !== null;

	return {
		status: queryStates.status,
		version: queryStates.version,
		none: queryStates.none,
		processor: queryStates.processor,
		interval: queryStates.interval,
		...(hasJoinedRange && {
			created_at_range: {
				start: joinedFrom ?? undefined,
				end: joinedTo ?? undefined,
			},
		}),
		...(hasActiveBalanceFilter(queryStates) && {
			balance: {
				feature_id: queryStates.balanceFeature,
				op: queryStates.balanceOp,
				value: parseBalanceValueInput(queryStates.balanceValue) ?? 0,
				basis: queryStates.balanceBasis,
			},
		}),
	};
}

type CursorStack = string[];

interface CustomerFiltersContextValue {
	queryStates: QueryStates[0];
	setQueryStates: QueryStates[1];
	setFilters: (filters: Partial<QueryStates[0]>) => void;
	isInitialized: boolean;
	cursorStack: CursorStack;
	currentCursor: string;
	currentPage: number;
	pushCursor: (next: string) => void;
	popCursor: () => void;
	resetCursor: () => void;
}

const CustomerFiltersContext =
	createContext<CustomerFiltersContextValue | null>(null);

export function CustomerFiltersProvider({ children }: { children: ReactNode }) {
	const { org } = useOrg();
	const orgId = org?.id;
	const env = useEnv();

	const [queryStates, setQueryStates] = useQueryStates(queryStatesConfig, {
		history: "replace",
	});

	const [cursorStack, setCursorStack] = useState<CursorStack>([""]);
	const currentCursor = cursorStack[cursorStack.length - 1] ?? "";
	const currentPage = cursorStack.length;

	const pushCursor = useCallback(
		(next: string) => setCursorStack((s) => [...s, next]),
		[],
	);
	const popCursor = useCallback(
		() => setCursorStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
		[],
	);
	const resetCursor = useCallback(() => setCursorStack([""]), []);

	const settleKey = orgId ? `${orgId}:${env}` : null;
	const [settledKey, setSettledKey] = useState<string | null>(null);
	const isInitialized = settledKey === settleKey;

	useEffect(() => {
		if (!settleKey) return;
		if (settledKey === settleKey) return;

		const isContextSwitch = settledKey !== null;

		const routerState = window.history.state?.usr;
		if (routerState?.preAppliedFilters) {
			setSettledKey(settleKey);
			return;
		}

		const currentParams = new URLSearchParams(window.location.search);
		const hasUrlFilterParams = FILTER_PARAM_KEYS.some((key) =>
			currentParams.has(key),
		);

		if (isContextSwitch || !hasUrlFilterParams) {
			const filters = getSavedFilters({ orgId: orgId!, env });
			setQueryStates(buildRestoredState({ filters })).then(() => {
				setSettledKey(settleKey);
			});
		} else {
			setSettledKey(settleKey);
		}
	}, [settleKey, settledKey, setQueryStates, orgId, env]);

	const setFilters = useMemo(
		() => (filters: Partial<typeof queryStates>) => {
			resetCursor();
			setQueryStates(filters);
		},
		[setQueryStates, resetCursor],
	);

	useEffect(() => {
		const onCustomersPage = window.location.pathname.endsWith("/customers");
		if (!orgId || !isInitialized || !onCustomersPage) return;

		try {
			localStorage.setItem(
				getStorageKey({ orgId, env }),
				JSON.stringify({
					status: queryStates.status,
					version: queryStates.version,
					none: queryStates.none,
					processor: queryStates.processor,
					interval: queryStates.interval,
					pageSize: queryStates.pageSize,
					sort: queryStates.sort,
					sortBy: queryStates.sortBy,
					sortFeature: queryStates.sortFeature,
					sortBasis: queryStates.sortBasis,
					balanceFeature: queryStates.balanceFeature,
					balanceOp: queryStates.balanceOp,
					balanceValue: queryStates.balanceValue,
					balanceBasis: queryStates.balanceBasis,
					joinedFrom: queryStates.joinedFrom,
					joinedTo: queryStates.joinedTo,
				}),
			);
		} catch {}
	}, [
		orgId,
		env,
		isInitialized,
		queryStates.status,
		queryStates.version,
		queryStates.none,
		queryStates.processor,
		queryStates.interval,
		queryStates.pageSize,
		queryStates.sort,
		queryStates.sortBy,
		queryStates.sortFeature,
		queryStates.sortBasis,
		queryStates.balanceFeature,
		queryStates.balanceOp,
		queryStates.balanceValue,
		queryStates.balanceBasis,
		queryStates.joinedFrom,
		queryStates.joinedTo,
	]);

	return (
		<CustomerFiltersContext.Provider
			value={{
				queryStates,
				setQueryStates,
				setFilters,
				isInitialized,
				cursorStack,
				currentCursor,
				currentPage,
				pushCursor,
				popCursor,
				resetCursor,
			}}
		>
			{children}
		</CustomerFiltersContext.Provider>
	);
}

/**
 * Inside CustomerFiltersProvider (customers list page): returns the provider's
 * managed state with initialization gating, localStorage restore, and cursor stack.
 *
 * Outside the provider (customer detail pages, layout, etc.): falls back to
 * reading URL query params directly via nuqs, always treated as initialized,
 * with an inert cursor stack.
 */
export function useCustomerFilters(): CustomerFiltersContextValue {
	const context = useContext(CustomerFiltersContext);
	const [queryStates, setQueryStates] = useQueryStates(queryStatesConfig, {
		history: "replace",
	});

	const setFilters = useMemo(
		() => (filters: Partial<typeof queryStates>) => {
			setQueryStates(filters);
		},
		[setQueryStates],
	);

	if (context) return context;

	return {
		queryStates,
		setQueryStates,
		setFilters,
		isInitialized: true,
		cursorStack: [""],
		currentCursor: "",
		currentPage: 1,
		pushCursor: () => {},
		popCursor: () => {},
		resetCursor: () => {},
	};
}
