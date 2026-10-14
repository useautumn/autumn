const routeRegexCache = new Map<string, RegExp>();

const getRouteRegex = (patternUrl: string): RegExp => {
	const cached = routeRegexCache.get(patternUrl);
	if (cached) {
		return cached;
	}

	const regexPattern = patternUrl
		.replace(/:[^/]+/g, "([^/]+)")
		.replace(/\//g, "\\/");

	const regex = new RegExp(`^${regexPattern}$`);
	routeRegexCache.set(patternUrl, regex);
	return regex;
};

export const matchRoute = ({
	url,
	method,
	pattern,
}: {
	url: string;
	method: string;
	pattern: { url: string; method: string };
}): boolean => {
	if (pattern.method !== method) {
		return false;
	}

	return getRouteRegex(pattern.url).test(url);
};
