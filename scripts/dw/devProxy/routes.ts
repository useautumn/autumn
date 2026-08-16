import { DEV_PATH_PREFIXES } from "@autumn/env/paths";

export type DevProxyService = "api" | "vite" | "leaf" | "checkout";

export type DevProxyRoute = {
	prefix: string;
	service: DevProxyService;
	/** Drop the prefix before forwarding so the process sees its normal paths. */
	stripPrefix?: boolean;
};

/** Public paths on the one hostname. Edit `@autumn/env` `DEV_PATH_PREFIXES`. */
export const DEV_PROXY_PREFIXES = {
	dashboard: DEV_PATH_PREFIXES.dashboard,
	api: DEV_PATH_PREFIXES.backend,
	leaf: DEV_PATH_PREFIXES.leaf,
	checkout: DEV_PATH_PREFIXES.checkout,
} as const;

export const DEV_PROXY_ROUTES: DevProxyRoute[] = [
	{ prefix: DEV_PROXY_PREFIXES.dashboard, service: "vite" },
	{ prefix: DEV_PROXY_PREFIXES.api, service: "api", stripPrefix: true },
	{ prefix: DEV_PROXY_PREFIXES.leaf, service: "leaf", stripPrefix: true },
	{ prefix: DEV_PROXY_PREFIXES.checkout, service: "checkout" },
];

export function originServiceUrls({ origin }: { origin: string }): {
	dashboard: string;
	api: string;
	leaf: string;
	checkout: string;
} {
	const base = origin.replace(/\/$/, "");
	return {
		dashboard: `${base}${DEV_PROXY_PREFIXES.dashboard}`,
		api: `${base}${DEV_PROXY_PREFIXES.api}`,
		leaf: `${base}${DEV_PROXY_PREFIXES.leaf}`,
		checkout: `${base}${DEV_PROXY_PREFIXES.checkout}`,
	};
}

export function matchDevProxyRoute({
	pathname,
	ports,
}: {
	pathname: string;
	ports: Record<DevProxyService, number>;
}): { service: DevProxyService; port: number; path: string } | null {
	const route = DEV_PROXY_ROUTES.filter((candidate) =>
		pathMatchesPrefix({ pathname, prefix: candidate.prefix }),
	).sort((a, b) => b.prefix.length - a.prefix.length)[0];

	if (!route) return null;

	const path = route.stripPrefix
		? stripPrefix({ pathname, prefix: route.prefix })
		: pathname;
	return { service: route.service, port: ports[route.service], path };
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
