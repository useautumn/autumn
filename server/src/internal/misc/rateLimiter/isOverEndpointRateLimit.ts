import { logger } from "@/external/logtail/logtailUtils.js";
import { shouldUseRedis } from "@/external/redis/initRedis.js";
import { matchRoute } from "@/honoMiddlewares/middlewareUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	type FixedWindowCounter,
	incrementFixedWindow,
} from "./fixedWindowCounter.js";
import { warnOrgCapExceeded } from "./rateLimitFactory.js";
import { getOrgEndpointRateLimitOverrides } from "./rateLimitOverridesStore.js";

const findMatchingEndpoint = ({
	ctx,
	method,
	path,
}: {
	ctx: AutumnContext;
	method: string;
	path: string;
}) => {
	const endpoints = getOrgEndpointRateLimitOverrides({
		orgId: ctx.org?.id,
		orgSlug: ctx.org?.slug,
	});
	return Object.entries(endpoints ?? {}).find(([endpoint]) => {
		const [patternMethod, url] = endpoint.split(" ");
		return matchRoute({
			url: path,
			method,
			pattern: { method: patternMethod, url },
		});
	});
};

/** Counts the request against its org's override for this endpoint; orgs without one never touch Redis. */
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
	const match = findMatchingEndpoint({ ctx, method, path });
	if (!match) return false;
	if (!counter && !shouldUseRedis()) return false;

	const [endpoint, { limit, windowMs }] = match;
	let hits: number;
	try {
		hits = await incrementFixedWindow({
			key: `endpoint:${ctx.org.id}:${ctx.env}:${endpoint}`,
			windowMs,
			counter,
			now,
		});
	} catch (error) {
		// Like the group limiters: a Redis failure lets the request through.
		logger.error(`[rate-limit] endpoint counter failed: ${error}`);
		return false;
	}

	if (hits <= limit) return false;
	warnOrgCapExceeded({
		limitType: `endpoint ${endpoint}`,
		orgSlug: ctx.org.slug,
	});
	return true;
};
