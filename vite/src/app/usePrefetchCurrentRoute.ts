import { useEffect } from "react";
import { matchPath, useLocation } from "react-router";
import { stripSandboxPrefix } from "@/hooks/sandbox/sandboxUrl";
import { loadCustomerView } from "@/views/customers2/customer/loadCustomerView";
import { usePrefetchPlanPage } from "@/views/products/plan/hooks/usePrefetchPlanPage";

/** On a direct load, starts the page's chunk (and plan data) while the org loads. */
export const usePrefetchCurrentRoute = () => {
	const { pathname, search } = useLocation();
	const prefetchPlanPage = usePrefetchPlanPage();
	const path = stripSandboxPrefix(pathname);
	const planId = matchPath("/products/:product_id", path)?.params.product_id;
	const isCustomerPage = Boolean(matchPath("/customers/:customer_id", path));
	const version = Number(new URLSearchParams(search).get("version")) || null;

	useEffect(() => {
		if (planId) prefetchPlanPage({ id: planId, version });
	}, [planId, version, prefetchPlanPage]);

	useEffect(() => {
		if (isCustomerPage) void loadCustomerView();
	}, [isCustomerPage]);
};
