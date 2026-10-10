import type {
	RateLimitEndpointPolicy,
	RateLimitOverridesView,
} from "./rateLimitTypes";

// The server's check on endpoint keys; it rejects anything else with a 400.
const ENDPOINT_PATTERN = /^(GET|POST|PUT|PATCH|DELETE) \/v1(\/[\w.:-]+)+$/;

/** "post  /v1/entities.delete" → "POST /v1/entities.delete", or null when it is not an endpoint. */
export const toEndpointKey = (text: string) => {
	const [method = "", ...path] = text.trim().split(/\s+/);
	const endpoint = `${method.toUpperCase()} ${path.join("")}`;
	return ENDPOINT_PATTERN.test(endpoint) ? endpoint : null;
};

export const splitEndpoint = (endpoint: string) => {
	const [method, path] = endpoint.split(" ");
	return { method, path };
};

/** Each overridden endpoint with the orgs that cap it, sorted by path. */
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

/** Known API endpoints plus any stored one the API no longer lists. */
export const listEndpointOptions = ({
	view,
}: {
	view: RateLimitOverridesView;
}) => {
	const stored = listEndpointPolicies({ view }).map(({ endpoint }) => endpoint);
	return [...new Set([...stored, ...view.knownEndpoints])];
};
