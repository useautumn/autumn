import { logger } from "@/external/logtail/logtailUtils.js";
import { shouldUseRedis } from "@/external/redis/initRedis.js";
import { matchRoute } from "@/honoMiddlewares/middlewareUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	type FixedWindowCounter,
	incrementFixedWindow,
} from "./fixedWindowCounter.js";
import { warnOrgCapExceeded } from "./rateLimitFactory.js";
import type { EndpointRateLimitOverride } from "./rateLimitOverridesSchemas.js";
import { getOrgEndpointRateLimitOverrides } from "./rateLimitOverridesStore.js";

type EndpointCap = [endpoint: string, override: EndpointRateLimitOverride];

/** Every override of the org matching the request, e.g. both `/customers/:id` and `/customers/clear_cache`. */
const findMatchingEndpoints = ({
	ctx,
	method,
	path,
}: {
	ctx: AutumnContext;
	method: string;
	path: string;
}): EndpointCap[] => {
	const endpoints = getOrgEndpointRateLimitOverrides({
		orgId: ctx.org?.id,
		orgSlug: ctx.org?.slug,
	});
	return Object.entries(endpoints ?? {}).filter(([endpoint]) => {
		const [patternMethod, url] = endpoint.split(" ");
		return matchRoute({
			url: path,
			method,
			pattern: { method: patternMethod, url },
		});
	});
};

const isOverEndpointCap = async ({
	ctx,
	cap: [endpoint, { limit, windowMs }],
	counter,
	now,
}: {
	ctx: AutumnContext;
	cap: EndpointCap;
	counter?: FixedWindowCounter;
	now?: number;
}) => {
	try {
		const hits = await incrementFixedWindow({
			key: `endpoint:${ctx.org?.id}:${ctx.env}:${endpoint}`,
			windowMs,
			counter,
			now,
		});
		return hits > limit;
	} catch (error) {
		// Like the group limiters: a Redis failure lets the request through.
		logger.error(`[rate-limit] endpoint counter failed: ${error}`);
		return false;
	}
};

const rejectEndpoint = ({
	ctx,
	endpoint,
}: {
	ctx: AutumnContext;
	endpoint: string;
}) => {
	warnOrgCapExceeded({
		limitType: `endpoint ${endpoint}`,
		orgSlug: ctx.org?.slug,
	});
	return true;
};

/** Counts the request against every matching override of its org; orgs without one never touch Redis. */
export const isOverEndpointRateLimit = async ({
	ctx,
	method,
	path,
	counter,
	now,
}: {
	ctx: AutumnContext;
	method: string;
	path: string;
	counter?: FixedWindowCounter;
	now?: number;
}): Promise<boolean> => {
	if (!ctx.org?.id) return false;
	const caps = findMatchingEndpoints({ ctx, method, path });
	if (caps.length === 0) return false;

	const blocked = caps.find(([, { limit }]) => limit === 0);
	if (blocked) return rejectEndpoint({ ctx, endpoint: blocked[0] });
	if (!counter && !shouldUseRedis()) return false;

	const over = await Promise.all(
		caps.map((cap) => isOverEndpointCap({ ctx, cap, counter, now })),
	);
	const exceeded = caps.find((_, index) => over[index]);
	if (!exceeded) return false;
	return rejectEndpoint({ ctx, endpoint: exceeded[0] });
};
