/** Better Auth mount. Relative `/backend` is resolved against the page origin. */
export const resolveAuthBaseUrl = ({
	backendUrl,
	origin,
}: {
	backendUrl: string;
	origin?: string;
}): string => {
	const path = `${backendUrl.replace(/\/$/, "")}/api/auth`;
	if (path.startsWith("http://") || path.startsWith("https://")) return path;
	if (!origin) return path;
	return new URL(path, origin).href;
};
