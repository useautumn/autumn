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
