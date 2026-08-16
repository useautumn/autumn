export type DevProxyService = "api" | "vite" | "checkout";

export type DevProxyRoute = {
	prefix: string;
	service: DevProxyService;
	/** Drop the prefix before forwarding (dashboard calls `/backend/organization`). */
	stripPrefix?: boolean;
};

/**
 * One public hostname → local ports. Longest prefix wins.
 * Edit this table to expose another service. `/` is the Vite SPA.
 *
 * `/backend` exists because the dashboard and the API both own `/customers`.
 * Slack / Anthropic / `/v1` keep their real server paths (no prefix).
 * Checkout is omitted until `apps/checkout` has `base: "/checkout/"`.
 */
export const DEV_PROXY_ROUTES: DevProxyRoute[] = [
	{ prefix: "/backend", service: "api", stripPrefix: true },
	{ prefix: "/.well-known", service: "api" },
	{ prefix: "/slack-unfurl", service: "api" },
	{ prefix: "/webhooks", service: "api" },
	{ prefix: "/checkouts", service: "api" },
	{ prefix: "/pricing-agent", service: "api" },
	{ prefix: "/revenuecat", service: "api" },
	{ prefix: "/consents", service: "api" },
	{ prefix: "/stripe", service: "api" },
	{ prefix: "/oauth", service: "api" },
	{ prefix: "/agent", service: "api" },
	{ prefix: "/slack", service: "api" },
	{ prefix: "/ready", service: "api" },
	{ prefix: "/auth", service: "api" },
	{ prefix: "/cli", service: "api" },
	{ prefix: "/mcp", service: "api" },
	{ prefix: "/api", service: "api" },
	{ prefix: "/v1", service: "api" },
	{ prefix: "/", service: "vite" },
];

export function matchDevProxyRoute({
	pathname,
	ports,
}: {
	pathname: string;
	ports: Record<DevProxyService, number>;
}): { service: DevProxyService; port: number; path: string } {
	const route = DEV_PROXY_ROUTES.filter((candidate) =>
		pathMatchesPrefix({ pathname, prefix: candidate.prefix }),
	).sort((a, b) => b.prefix.length - a.prefix.length)[0];

	if (!route) {
		return { service: "vite", port: ports.vite, path: pathname };
	}

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
	if (prefix === "/") return true;
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
