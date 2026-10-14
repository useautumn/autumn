import { useEffect, useState } from "react";
import { matchPath, useLocation } from "react-router";
import { stripSandboxPrefix } from "@/hooks/sandbox/sandboxUrl";
import { usePrefetchCustomerPage } from "@/views/customers2/customer/hooks/usePrefetchCustomerPage";
import { usePrefetchPlanPage } from "@/views/products/plan/hooks/usePrefetchPlanPage";
import { CustomersListRoute, routeChunkForPath } from "./routeChunks";

/**
 * On a direct load, starts the page's chunk and data while the org loads, and
 * reports when the chunk is in so the route renders without suspending.
 */
export const usePrefetchCurrentRoute = () => {
	const { pathname, search } = useLocation();
	const prefetchPlanPage = usePrefetchPlanPage();
	const path = stripSandboxPrefix(pathname);
	const planId = matchPath("/products/:product_id", path)?.params.product_id;
	const customerId = matchPath("/customers/:customer_id", path)?.params
		.customer_id;
	const version = Number(new URLSearchParams(search).get("version")) || null;
	const routeChunk = routeChunkForPath(pathname);
	const [loadedChunk, setLoadedChunk] = useState<typeof routeChunk>();

	useEffect(() => {
		if (planId) prefetchPlanPage({ id: planId, version });
	}, [planId, version, prefetchPlanPage]);

	usePrefetchCustomerPage({ customerId });

	useEffect(() => {
		if (!routeChunk || routeChunk.isLoaded()) return;
		let cancelled = false;
		void routeChunk.preload().then(() => {
			if (!cancelled) setLoadedChunk(() => routeChunk);
		});
		return () => {
			cancelled = true;
		};
	}, [routeChunk]);

	return {
		isCustomersList: routeChunk === CustomersListRoute,
		// Suspending here would make React hold the page back another 300ms once it's ready.
		routeChunkReady:
			!routeChunk || routeChunk.isLoaded() || loadedChunk === routeChunk,
	};
};
