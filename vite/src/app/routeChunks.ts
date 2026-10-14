import { matchPath } from "react-router";
import { stripSandboxPrefix } from "@/hooks/sandbox/sandboxUrl";
import { lazyWithPreload } from "@/lib/lazyWithPreload";

export const ProductsListRoute = lazyWithPreload(
	() => import("@/views/products/ProductsView"),
);
export const PlanEditorRoute = lazyWithPreload(
	() => import("@/views/products/plan/PlanEditorView"),
);
export const CustomersListRoute = lazyWithPreload(
	() => import("@/views/customers/CustomersPage"),
);
export const CustomerViewRoute = lazyWithPreload(
	() => import("@/views/customers2/customer/CustomerView2"),
);

const ROUTE_CHUNKS = [
	{ pattern: "/products", route: ProductsListRoute },
	{ pattern: "/products/:product_id", route: PlanEditorRoute },
	{ pattern: "/customers", route: CustomersListRoute },
	{ pattern: "/customers/:customer_id", route: CustomerViewRoute },
];

/** The lazy route a dashboard path renders, for the pages worth fetching ahead. */
export const routeChunkForPath = (pathname: string) => {
	const path = stripSandboxPrefix(pathname);
	return ROUTE_CHUNKS.find(({ pattern }) => matchPath(pattern, path))?.route;
};
