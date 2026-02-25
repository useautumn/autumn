import { useEffect } from "react";
import { useOrg } from "@/hooks/common/useOrg";
import { useCustomersQueryStates } from "./useCustomersQueryStates";

const FILTERS_KEY = "autumn:customer-filters";
const ORG_KEY = "autumn_org";

type PersistedCustomerFilters = {
	status: string[];
	version: string[];
	none: boolean;
	pageSize: number;
};

function getSavedFilters({
	orgId,
}: {
	orgId: string;
}): PersistedCustomerFilters | null {
	try {
		const stored = localStorage.getItem(FILTERS_KEY);
		if (!stored) return null;
		return JSON.parse(stored)[orgId] ?? null;
	} catch {
		return null;
	}
}

let hasRestored = false;

/** Call synchronously at the top of CustomersPage render, before any hooks. On first call per mount cycle, replaces URL params with the current org's saved filters from localStorage (or clears them). This ensures stale params from a previous org are never carried over. */
export function restoreCustomerFilters() {
	if (hasRestored) return;
	hasRestored = true;

	try {
		const orgData = localStorage.getItem(ORG_KEY);
		if (!orgData) return;
		const { id: orgId } = JSON.parse(orgData);

		const filters = getSavedFilters({ orgId });

		const params = new URLSearchParams();
		if (filters?.status?.length)
			params.set("status", filters.status.join(","));
		if (filters?.version?.length)
			params.set("version", filters.version.join(","));
		if (filters?.none) params.set("none", "true");
		if (filters?.pageSize && filters.pageSize !== 50)
			params.set("pageSize", String(filters.pageSize));

		const paramString = params.toString();
		const newUrl = paramString
			? `${window.location.pathname}?${paramString}`
			: window.location.pathname;
		window.history.replaceState(null, "", newUrl);
	} catch {}
}

/** Persists current filter queryStates to localStorage whenever they change. */
export function usePersistedFilters() {
	const { org } = useOrg();
	const { queryStates } = useCustomersQueryStates();

	const orgId = org?.id;

	// Reset the module-level flag when the component unmounts so that
	// navigating back to the customers page re-reads from localStorage.
	useEffect(() => {
		return () => {
			hasRestored = false;
		};
	}, []);

	// Persist current filters to localStorage keyed by org
	useEffect(() => {
		if (!orgId) return;

		try {
			const stored = localStorage.getItem(FILTERS_KEY);
			const map: Record<string, PersistedCustomerFilters> = stored
				? JSON.parse(stored)
				: {};

			map[orgId] = {
				status: queryStates.status,
				version: queryStates.version,
				none: queryStates.none,
				pageSize: queryStates.pageSize,
			};

			localStorage.setItem(FILTERS_KEY, JSON.stringify(map));
		} catch {}
	}, [
		orgId,
		queryStates.status,
		queryStates.version,
		queryStates.none,
		queryStates.pageSize,
	]);
}
