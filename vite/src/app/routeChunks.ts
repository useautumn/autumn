import { matchPath } from "react-router";
import { stripSandboxPrefix } from "@/hooks/sandbox/sandboxUrl";
import { CustomerViewRoute } from "@/views/customers2/customer/loadCustomerView";
import { PlanEditorRoute } from "@/views/products/plan/loadPlanEditorView";
import { CustomersListRoute, ProductsListRoute } from "./listRoutes";

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
