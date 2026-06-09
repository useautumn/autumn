import {
	parseAsArrayOf,
	parseAsBoolean,
	parseAsInteger,
	parseAsString,
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
	"pageSize",
] as const;

type PersistedCustomerFilters = {
	status: string[];
	version: string[];
	none: boolean;
	processor: string[];
	pageSize: number;
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
		pageSize:
			filters?.pageSize && filters.pageSize !== DEFAULT_CUSTOMER_LIST_PAGE_SIZE
				? filters.pageSize
				: null,
	};
}

const queryStatesConfig = {
	q: parseAsString.withDefault(""),
	status: parseAsArrayOf(parseAsString).withDefault([]),
	version: parseAsArrayOf(parseAsString).withDefault([]),
	none: parseAsBoolean.withDefault(false),
	processor: parseAsArrayOf(parseAsString).withDefault([]),
	pageSize: parseAsInteger.withDefault(DEFAULT_CUSTOMER_LIST_PAGE_SIZE),
};

type QueryStates = ReturnType<typeof useQueryStates<typeof queryStatesConfig>>;

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

export function CustomerFiltersProvider({
	children,
}: { children: ReactNode }) {
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
		() =>
			setCursorStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
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
					pageSize: queryStates.pageSize,
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
		queryStates.pageSize,
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
