/** Append `path` to a public base that may already include `/backend`. */
export const joinPublicUrl = ({
	base,
	path,
}: {
	base: string;
	path: string;
}): string => {
	const url = new URL(base);
	const prefix = url.pathname.replace(/\/$/, "");
	const suffix = path.startsWith("/") ? path : `/${path}`;
	url.pathname = `${prefix}${suffix}`;
	return url.href;
};

/** Vite `base` from a public app URL (`https://host/dashboard` → `/dashboard/`). */
export const publicPathBase = (url?: string): string => {
	if (!url) return "/";
	try {
		const path = new URL(url).pathname.replace(/\/$/, "");
		return path ? `${path}/` : "/";
	} catch {
		return "/";
	}
};
