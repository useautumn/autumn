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

export const normalizeRequestPath = (url: string): string =>
	pathNormalizationSteps.reduce(
		(path, step) =>
			path.replace(new RegExp(step.pattern, "g"), step.replacement),
		url.trim(),
	);
