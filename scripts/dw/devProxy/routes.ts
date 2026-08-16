export type DevProxyService =
	| "api"
	| "vite"
	| "leaf"
	| "checkout"
	| "emulate";

export type DevProxyRoute = {
	prefix: string;
	service: DevProxyService;
	/** Drop the prefix before forwarding so the process sees its normal paths. */
	stripPrefix?: boolean;
};

/** Public paths on the one hostname. Dashboard is the origin itself. */
export const DEV_PROXY_PREFIXES = {
	api: "/backend",
	leaf: "/leaf",
	checkout: "/checkout",
	emulate: "/emulate",
} as const;

export const DEV_PROXY_ROUTES: DevProxyRoute[] = [
	{ prefix: DEV_PROXY_PREFIXES.api, service: "api", stripPrefix: true },
	{ prefix: DEV_PROXY_PREFIXES.leaf, service: "leaf", stripPrefix: true },
	{
		prefix: DEV_PROXY_PREFIXES.checkout,
		service: "checkout",
		stripPrefix: true,
	},
	{ prefix: DEV_PROXY_PREFIXES.emulate, service: "emulate", stripPrefix: true },
];

/** Vite/checkout emit these at origin root when `base` is `/`. */
const VITE_DEV_PREFIXES = [
	"/@vite",
	"/@fs",
	"/@id",
	"/@react-refresh",
	"/src",
	"/node_modules",
	"/assets",
] as const;

export function originServiceUrls({ origin }: { origin: string }): {
	dashboard: string;
	api: string;
	leaf: string;
	checkout: string;
	emulate: string;
} {
	const base = origin.replace(/\/$/, "");
	return {
		dashboard: base,
		api: `${base}${DEV_PROXY_PREFIXES.api}`,
		leaf: `${base}${DEV_PROXY_PREFIXES.leaf}`,
		checkout: `${base}${DEV_PROXY_PREFIXES.checkout}`,
		emulate: `${base}${DEV_PROXY_PREFIXES.emulate}`,
	};
}

export function matchDevProxyRoute({
	pathname,
	ports,
	referer,
	websocket,
}: {
	pathname: string;
	ports: Record<DevProxyService, number>;
	referer?: string;
	websocket?: boolean;
}): { service: DevProxyService; port: number; path: string } | null {
	const route = DEV_PROXY_ROUTES.filter((candidate) =>
		pathMatchesPrefix({ pathname, prefix: candidate.prefix }),
	).sort((a, b) => b.prefix.length - a.prefix.length)[0];

	if (route) {
		const path = route.stripPrefix
			? stripPrefix({ pathname, prefix: route.prefix })
			: pathname;
		return { service: route.service, port: ports[route.service], path };
	}

	if (isViteDevPath(pathname) || (websocket && pathname === "/")) {
		const service = viteServiceFromReferer(referer);
		return { service, port: ports[service], path: pathname };
	}

	return { service: "vite", port: ports.vite, path: pathname };
}

function isViteDevPath(pathname: string): boolean {
	return VITE_DEV_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
	);
}

function viteServiceFromReferer(referer?: string): "vite" | "checkout" {
	if (!referer) return "vite";
	try {
		const path = new URL(referer).pathname;
		if (
			pathMatchesPrefix({
				pathname: path,
				prefix: DEV_PROXY_PREFIXES.checkout,
			})
		) {
			return "checkout";
		}
	} catch {
		// invalid Referer
	}
	return "vite";
}

function pathMatchesPrefix({
	pathname,
	prefix,
}: {
	pathname: string;
	prefix: string;
}): boolean {
	return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function stripPrefix({
	pathname,
	prefix,
}: {
	pathname: string;
	prefix: string;
}): string {
	if (pathname === prefix) return "/";
	return pathname.slice(prefix.length) || "/";
}
