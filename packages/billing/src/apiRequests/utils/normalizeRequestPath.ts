/**
 * Rules that turn whatever the request log stores as `req.url` into a bare,
 * version-less path. Applied in order, in TypeScript and in APL alike, so a
 * change to the logged format (host on or off, `/v1` on or off, trailing
 * slash, query string) never changes what an endpoint matches. RE2 syntax only.
 */
export const pathNormalizationSteps = [
	{ name: "drop scheme and host", pattern: "^[a-z]+://[^/]*", replacement: "" },
	{ name: "drop query and fragment", pattern: "[?#].*$", replacement: "" },
	{ name: "ensure leading slash", pattern: "^([^/])", replacement: "/$1" },
	{
		name: "drop api version prefix",
		pattern: "^/v[0-9]+(/|$)",
		replacement: "/",
	},
	{ name: "collapse repeated slashes", pattern: "/{2,}", replacement: "/" },
	{ name: "drop trailing slash", pattern: "(.)/$", replacement: "$1" },
] as const;

/** `https://api.useautumn.com/v1/customers/cus_1/?x=1` → `/customers/cus_1`. Global, like APL replace_regex. */
export const normalizeRequestPath = (url: string): string =>
	pathNormalizationSteps.reduce(
		(path, step) =>
			path.replace(new RegExp(step.pattern, "g"), step.replacement),
		url.trim(),
	);
