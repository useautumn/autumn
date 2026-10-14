import type {
	RateLimitEndpointPolicy,
	RateLimitOverridesView,
} from "./rateLimitTypes";

const ENDPOINT_PATTERN = /^(GET|POST|PUT|PATCH|DELETE) \/v1(\/[\w.:-]+)+$/;

export const toEndpointKey = (text: string) => {
	const [method = "", ...path] = text.trim().split(/\s+/);
	const endpoint = `${method.toUpperCase()} ${path.join("")}`;
	return ENDPOINT_PATTERN.test(endpoint) ? endpoint : null;
};

export const listEndpointMatches = ({
	endpoints,
	search,
}: {
	endpoints: string[];
	search: string;
}) => {
	const term = search.trim().toLowerCase();
	const matching = endpoints.filter((endpoint) =>
		endpoint.toLowerCase().includes(term),
	);
	const typed = toEndpointKey(search);
	return typed && !matching.includes(typed) ? [typed, ...matching] : matching;
};

export const splitEndpoint = (endpoint: string) => {
	const [method, path] = endpoint.split(" ");
	return { method, path };
};

export const listEndpointPolicies = ({
	view,
}: {
	view: RateLimitOverridesView;
}): RateLimitEndpointPolicy[] => {
	const byEndpoint = new Map<string, RateLimitEndpointPolicy>();
	for (const [orgKey, { endpoints }] of Object.entries(view.orgs)) {
		for (const [endpoint, override] of Object.entries(endpoints ?? {})) {
			const policy = byEndpoint.get(endpoint) ?? { endpoint, overrides: [] };
			policy.overrides.push({ orgKey, ...override });
			byEndpoint.set(endpoint, policy);
		}
	}
	return [...byEndpoint.values()].sort((a, b) =>
		splitEndpoint(a.endpoint).path.localeCompare(
			splitEndpoint(b.endpoint).path,
		),
	);
};

export const listEndpointOptions = ({
	view,
}: {
	view: RateLimitOverridesView;
}) => {
	const stored = listEndpointPolicies({ view }).map(({ endpoint }) => endpoint);
	return [...new Set([...stored, ...view.knownEndpoints])];
};
