// Imported by the inline boot script, so it must stay free of app and @autumn/shared barrel imports.
import { CUSTOMER_PRODUCTS_DEFAULT_LIMIT } from "../../../shared/api/customers/cusPlans/customerProductsLimits";
import { RESERVED_SANDBOX_SLUGS } from "../../../shared/models/orgModels/sandboxName";

export const ACTIVE_SANDBOX_STORAGE_KEY = "autumn_active_sandbox";
export const DASHBOARD_API_VERSION = "1.2";

/** The lazy page modules in app/routeChunks.ts, so a direct load can fetch its page's chunks with the entry. */
export const ROUTE_MODULES = {
	customer: "src/views/customers2/customer/CustomerView2.tsx",
	plan: "src/views/products/plan/PlanEditorView.tsx",
	customers: "src/views/customers/CustomersPage.tsx",
	products: "src/views/products/ProductsView.tsx",
} as const;

export type BootRoute = keyof typeof ROUTE_MODULES;

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

const routeFromPath = (pathname: string) => {
	const segments = pathname.split("/").filter(Boolean);
	const isSandbox = segments[0] === "sandbox";
	if (isSandbox) segments.shift();
	const sandboxSlug =
		isSandbox && segments[0] && !RESERVED_SANDBOX_SLUGS.has(segments[0])
			? segments.shift()
			: undefined;
	return {
		env: isSandbox ? "sandbox" : "live",
		sandboxSlug,
		segments: segments.map(decodeURIComponent),
	};
};

/** The GETs a direct load of this URL renders from, so the boot script can start them before the bundle runs. */
export const bootRequestsForLocation = ({
	pathname,
	search,
}: {
	pathname: string;
	search: string;
}) => {
	const { env, sandboxSlug, segments } = routeFromPath(pathname);
	const params = new URLSearchParams(search);
	const [section, id, ...rest] = segments;
	const shared: BootRequest[] = [
		{ path: "/organization" },
		{ path: "/products/features" },
	];

	const customerRequests = (customerId: string): BootRequest[] => {
		const entityId = params.get("entity_id");
		const statuses = (params.get("customerProductsStatuses") ?? "active").split(
			",",
		);
		const requests: BootRequest[] = [
			{
				path: customerDataUrl({
					customerId,
					entityId,
					includeExpiredLoose: statuses.includes("expired"),
				}),
			},
		];
		// The entity view also waits on its plans page and licenses before rendering.
		if (!entityId || params.has("customerProductsKind")) return requests;
		return [
			...requests,
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

	const route = ((): { route: BootRoute; requests: BootRequest[] } | null => {
		if (rest.length > 0) return null;
		if (section === "customers" && id)
			return { route: "customer", requests: customerRequests(id) };
		if (section === "customers") return { route: "customers", requests: [] };
		if (section === "products" && id)
			return {
				route: "plan",
				requests: [
					{
						path: productDataUrl({
							productId: id,
							version: Number(params.get("version")) || null,
						}),
					},
				],
			};
		if (section === "products")
			return {
				route: "products",
				requests: [
					{ path: "/products/products" },
					{ path: "/products/product_counts" },
				],
			};
		return null;
	})();

	return {
		env,
		sandboxSlug,
		route: route?.route,
		requests: route ? [...shared, ...route.requests] : [],
	};
};

export type BootResponse = {
	status: number;
	headers: Record<string, string>;
	body: string;
};

type BootStore = Map<string, Promise<BootResponse | null>>;

declare global {
	interface Window {
		__autumnBoot?: { startedAt: number; responses: BootStore };
	}
}

/** Two requests share a boot response only if every input the server reads matches. */
export type BootRequest = {
	path: string;
	method?: "GET" | "POST";
	body?: string;
};

export const bootRequestKey = ({
	method = "GET",
	url,
	body,
	env,
	sandboxOrgId,
	apiVersion,
}: {
	method?: string;
	url: string;
	body?: string | null;
	env?: string | null;
	sandboxOrgId?: string | null;
	apiVersion?: string | null;
}) =>
	[
		method.toUpperCase(),
		new URL(url, window.location.origin).href,
		body,
		env,
		sandboxOrgId,
		apiVersion,
	]
		.map((part) => part ?? "")
		.join("|");

/** Only answers requests made while the page is still loading; later ones go to the network. */
const BOOT_RESPONSE_TTL_MS = 15_000;

/** Hands out a boot response once, so a later refetch always reaches the server. */
export const takeBootResponse = (
	key: string,
): Promise<BootResponse | null> | undefined => {
	const boot = window.__autumnBoot;
	if (!boot || Date.now() - boot.startedAt > BOOT_RESPONSE_TTL_MS) return;
	const response = boot.responses.get(key);
	boot.responses.delete(key);
	return response;
};
