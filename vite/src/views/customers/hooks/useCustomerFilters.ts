import {
	parseAsArrayOf,
	parseAsBoolean,
	parseAsInteger,
	parseAsString,
	useQueryStates,
} from "nuqs";
import { useCallback, useEffect, useState } from "react";
import { useOrg } from "@/hooks/common/useOrg";
import { useEnv } from "@/utils/envUtils";

const FILTERS_KEY_PREFIX = "autumn:customer-filters";

const FILTER_PARAM_KEYS = [
	"q",
	"status",
	"version",
	"none",
	"page",
	"pageSize",
] as const;

type PersistedCustomerFilters = {
	status: string[];
	version: string[];
	none: boolean;
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
		page: null,
		pageSize:
			filters?.pageSize && filters.pageSize !== 50 ? filters.pageSize : null,
		lastItemId: null,
	};
}

export const useCustomerFilters = () => {
	const { org } = useOrg();
	const orgId = org?.id;
	const env = useEnv();

	const [queryStates, setQueryStates] = useQueryStates(
		{
			q: parseAsString.withDefault(""),
			status: parseAsArrayOf(parseAsString).withDefault([]),
			version: parseAsArrayOf(parseAsString).withDefault([]),
			none: parseAsBoolean.withDefault(false),
			page: parseAsInteger.withDefault(1),
			pageSize: parseAsInteger.withDefault(50),
			lastItemId: parseAsString.withDefault(""),
		},
		{
			history: "replace",
		},
	);

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

	const setFilters = useCallback(
		(filters: Partial<Omit<typeof queryStates, "page" | "lastItemId">>) => {
			setQueryStates({ ...filters, page: 1, lastItemId: "" });
		},
		[setQueryStates],
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
		queryStates.pageSize,
	]);

	return {
		queryStates,
		setQueryStates,
		setFilters,
		isInitialized,
	};
};
