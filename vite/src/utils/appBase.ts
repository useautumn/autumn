/** Public folder on the shared ngrok host. Empty on localhost / prod. */
export const PUBLIC_MOUNT = "/dashboard";

export const appBase = (
	baseUrl?: string,
	pathname?: string,
): string => {
	if (baseUrl !== undefined) return baseUrl.replace(/\/$/, "");
	const path =
		pathname ??
		(typeof window === "undefined" ? "/" : window.location.pathname);
	if (path === PUBLIC_MOUNT || path.startsWith(`${PUBLIC_MOUNT}/`)) {
		return PUBLIC_MOUNT;
	}
	return "";
};

/** Drop the public folder so route helpers see `/products`, etc. */
export const stripAppBase = (
	pathname: string,
	baseUrl?: string,
): string => {
	const base = appBase(baseUrl, pathname);
	if (!base) return pathname;
	if (pathname === base) return "/";
	if (pathname.startsWith(`${base}/`)) {
		return pathname.slice(base.length) || "/";
	}
	return pathname;
};

/** Prefix a dashboard path when the address bar is under the public folder. */
export const appHref = (path: string, baseUrl?: string): string => {
	const base = appBase(baseUrl);
	if (!base || !path.startsWith("/") || path.startsWith("//")) return path;
	if (path === base || path.startsWith(`${base}/`)) return path;
	if (path === "/") return `${base}/`;
	return `${base}${path}`;
};

/** Same-origin absolute URL for OAuth callbacks (ngrok vs localhost). */
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
