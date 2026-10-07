import { type ApiVersion, ApiVersionClass } from "@autumn/shared";
import type { RateLimitLayer } from "./types/rateLimitLayer";

/** `matchedVersion` is the upTo key that applied; it scopes the layer's counter. */
export const resolveLayerLimit = ({
	layer,
	apiVersion,
}: {
	layer: RateLimitLayer;
	apiVersion?: ApiVersion;
}): { limit: number; matchedVersion?: ApiVersion } => {
	const { limit } = layer;
	if (typeof limit === "number") return { limit };
	if (!apiVersion) return { limit: limit.otherwise };

	const exact = limit.upTo[apiVersion];
	if (exact !== undefined) return { limit: exact, matchedVersion: apiVersion };

	const ascendingKeys = Object.keys(limit.upTo)
		.map((version) => new ApiVersionClass(version as ApiVersion))
		.sort((a, b) => (a.lt(b) ? -1 : 1));

	const requested = new ApiVersionClass(apiVersion);
	for (const key of ascendingKeys) {
		const keyLimit = limit.upTo[key.value];
		if (requested.lte(key) && keyLimit !== undefined) {
			return { limit: keyLimit, matchedVersion: key.value };
		}
	}

	return { limit: limit.otherwise };
};
