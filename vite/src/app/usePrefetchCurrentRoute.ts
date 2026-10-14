import { useQuery } from "@tanstack/react-query";
import { matchPath, useLocation } from "react-router";
import { stripSandboxPrefix } from "@/hooks/sandbox/sandboxUrl";
import { useChunkSettled } from "@/lib/lazyWithPreload";
import { usePrefetchCustomerPage } from "@/views/customers2/customer/hooks/usePrefetchCustomerPage";
import { useProductDataQueryOptions } from "@/views/products/product/hooks/useProductDataQueryOptions";
import { CustomersListRoute, routeChunkForPath } from "./routeChunks";

/**
 * On a direct load, starts the page's chunk and data while the org loads, and
 * reports when the chunk is in so the route renders without suspending.
 */
export const usePrefetchCurrentRoute = () => {
	const { pathname, search } = useLocation();
	const path = stripSandboxPrefix(pathname);
	const planId = matchPath("/products/:product_id", path)?.params.product_id;
	const customerId = matchPath("/customers/:customer_id", path)?.params
		.customer_id;
	const routeChunk = routeChunkForPath(pathname);
	const productDataQueryOptions = useProductDataQueryOptions();

	useQuery(
		productDataQueryOptions({
			productId: planId,
			version: Number(new URLSearchParams(search).get("version")) || null,
		}),
	);
	usePrefetchCustomerPage({ customerId });

	return {
		isCustomersList: routeChunk === CustomersListRoute,
		routeChunkReady: useChunkSettled(routeChunk),
	};
};
