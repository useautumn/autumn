// Imported by the inline boot script, so it must stay free of app and @autumn/shared barrel imports.
import { CUSTOMER_PRODUCTS_DEFAULT_LIMIT } from "../../../shared/api/customers/cusPlans/customerProductsLimits";
import { RESERVED_SANDBOX_SLUGS } from "../../../shared/models/orgModels/sandboxName";

export const ACTIVE_SANDBOX_STORAGE_KEY = "autumn_active_sandbox";
export const DASHBOARD_API_VERSION = "1.2";

/** The headers every dashboard API request carries, so the boot script's requests match the app's. */
export const dashboardRequestHeaders = ({
	env,
	sandboxOrgId,
	apiVersion,
}: {
	env: string;
	sandboxOrgId?: string | null;
	apiVersion: string;
}) => ({
	app_env: env,
	"x-api-version": apiVersion,
	"x-client-type": "dashboard",
	...(sandboxOrgId && { "x-sandbox-org-id": sandboxOrgId }),
});

/** The lazy page modules in app/routeChunks.ts, so a direct load can fetch its page's chunks with the entry. */
export const ROUTE_MODULES = {
	customer: "src/views/customers2/customer/CustomerView2.tsx",
	plan: "src/views/products/plan/PlanEditorView.tsx",
	customers: "src/views/customers/CustomersPage.tsx",
	products: "src/views/products/ProductsView.tsx",
} as const;

type BootRoute = keyof typeof ROUTE_MODULES;

export type BootRequest = {
	path: string;
	method?: "GET" | "POST";
	body?: string;
};

export const customerDataUrl = ({
	customerId,
	entityId,
	includeExpiredLoose,
}: {
	customerId: string;
	entityId: string | null;
	includeExpiredLoose: boolean;
}) => {
	const params = new URLSearchParams();
	if (includeExpiredLoose) params.set("include_expired_loose", "true");
	if (entityId) params.set("entity_id", entityId);
	const query = params.toString();
	return `/customers/${customerId}${query ? `?${query}` : ""}`;
};

export const customerProductsPageUrl = ({
	customerId,
	cursor,
	pageSize,
	status,
	kind,
	entityId,
}: {
	customerId: string;
	cursor: string;
	pageSize: number;
	status: string;
	kind: string;
	entityId: string | null;
}) => {
	const params = new URLSearchParams({
		start_cursor: cursor,
		limit: String(pageSize),
		status,
	});
	if (kind !== "all") params.set("kind", kind);
	if (entityId) params.set("entity_id", entityId);
	return `/customers/${customerId}/products?${params}`;
};

export const productDataUrl = ({
	productId,
	version,
}: {
	productId: string;
	version: number | null;
}) => `/products/${productId}/data${version ? `?version=${version}` : ""}`;

const ORG_REQUESTS: BootRequest[] = [
	{ path: "/organization" },
	{ path: "/products/features" },
];

const parsePath = (pathname: string) => {
	const segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);
	const isSandbox = segments[0] === "sandbox";
	if (isSandbox) segments.shift();
	const sandboxSlug =
		isSandbox && segments[0] && !RESERVED_SANDBOX_SLUGS.has(segments[0])
			? segments.shift()
			: undefined;
	return { env: isSandbox ? "sandbox" : "live", sandboxSlug, segments };
};

const customerRequests = ({
	customerId,
	params,
}: {
	customerId: string;
	params: URLSearchParams;
}): BootRequest[] => {
	const entityId = params.get("entity_id");
	const statuses = (params.get("customerProductsStatuses") ?? "active").split(
		",",
	);
	const customer: BootRequest = {
		path: customerDataUrl({
			customerId,
			entityId,
			includeExpiredLoose: statuses.includes("expired"),
		}),
	};
	if (!entityId || params.has("customerProductsKind")) return [customer];

	// The entity view also waits on its plans page and licenses before rendering.
	return [
		customer,
		{
			path: customerProductsPageUrl({
				customerId,
				cursor: "",
				pageSize: CUSTOMER_PRODUCTS_DEFAULT_LIMIT,
				status: statuses.length === 1 ? statuses[0] : "all",
				kind: "all",
				entityId,
			}),
		},
		{
			path: "/v1/licenses.list",
			method: "POST",
			body: JSON.stringify({ customer_id: customerId, entity_id: entityId }),
		},
		{ path: "/products/license_products" },
	];
};

const landingPage = ({
	section,
	id,
	params,
}: {
	section?: string;
	id?: string;
	params: URLSearchParams;
}): { route: BootRoute; requests: BootRequest[] } | null => {
	if (section === "customers")
		return id
			? {
					route: "customer",
					requests: customerRequests({ customerId: id, params }),
				}
			: { route: "customers", requests: [] };
	if (section === "products")
		return id
			? {
					route: "plan",
					requests: [
						{
							path: productDataUrl({
								productId: id,
								version: Number(params.get("version")) || null,
							}),
						},
					],
				}
			: {
					route: "products",
					requests: [
						{ path: "/products/products" },
						{ path: "/products/product_counts" },
					],
				};
	return null;
};

/** The requests a direct load of this URL renders from, so the boot script can start them before the bundle runs. */
export const bootRequestsForLocation = ({
	pathname,
	search,
}: {
	pathname: string;
	search: string;
}) => {
	const {
		env,
		sandboxSlug,
		segments: [section, id, ...rest],
	} = parsePath(pathname);
	const page =
		rest.length === 0
			? landingPage({ section, id, params: new URLSearchParams(search) })
			: null;

	return {
		env,
		sandboxSlug,
		route: page?.route,
		requests: page ? [...ORG_REQUESTS, ...page.requests] : [],
	};
};
