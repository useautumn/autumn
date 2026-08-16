import { isCrossAppDevPath } from "@autumn/env/paths";

/** Vite `base` without a trailing slash. Empty when the app is served at `/`. */
export const appBase = (baseUrl = import.meta.env.BASE_URL || "/"): string =>
	baseUrl.replace(/\/$/, "");

/** Drop `/dashboard` (path-proxy base) so route helpers see `/products`, etc. */
export const stripAppBase = (
	pathname: string,
	baseUrl?: string,
): string => {
	const base = appBase(baseUrl);
	if (!base) return pathname;
	if (pathname === base) return "/";
	if (pathname.startsWith(`${base}/`)) {
		return pathname.slice(base.length) || "/";
	}
	return pathname;
};

/** Prefix a same-origin path with Vite `base` for `window.location` assigns. */
export const appHref = (path: string, baseUrl?: string): string => {
	const base = appBase(baseUrl);
	if (!base || !path.startsWith("/") || path.startsWith("//")) return path;
	if (path.startsWith("/api") || isCrossAppDevPath(path)) return path;
	if (path === base || path.startsWith(`${base}/`)) return path;
	if (path === "/") return `${base}/`;
	return `${base}${path}`;
};

/** Same-origin absolute URL for OAuth callbacks (ngrok vs port-forward). */
export const appOriginHref = (
	path: string,
	baseUrl?: string,
	origin = typeof window === "undefined" ? undefined : window.location.origin,
): string => {
	const href = appHref(path, baseUrl);
	if (href.startsWith("http://") || href.startsWith("https://")) return href;
	if (!origin) return href;
	return new URL(href, origin).href;
};
