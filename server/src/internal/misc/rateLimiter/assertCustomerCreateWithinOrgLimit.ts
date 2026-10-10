import { RecaseError } from "@autumn/shared";
import { logger } from "@/external/logtail/logtailUtils.js";
import { getMiscRedis, shouldUseRedis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { RATE_LIMIT_CONFIGS, RateLimitType } from "./rateLimitConfigs.js";
import { getOrgRateLimitOverride } from "./rateLimitOverridesStore.js";

type CreateCounter = {
	incr: (key: string) => Promise<number>;
	pexpire: (key: string, ms: number) => Promise<unknown>;
};

/** Caps customer creations per org per window; reads that find an existing customer never count. */
export const assertCustomerCreateWithinOrgLimit = async ({
	ctx,
	counter,
}: {
	ctx: AutumnContext;
	counter?: CreateCounter;
}) => {
	if (!ctx.org?.id) return;
	if (!counter && !shouldUseRedis()) return;
	const redis = counter ?? getMiscRedis();

	const type = RateLimitType.CustomerCreateOrg;
	const { windowMs, limit: defaultLimit } = RATE_LIMIT_CONFIGS[type];
	const limit =
		getOrgRateLimitOverride({
			orgId: ctx.org.id,
			orgSlug: ctx.org.slug,
			type,
		}) ?? defaultLimit;
	const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
	const key = `hrl:${type}:${ctx.org.id}:${ctx.env}:${windowStart}`;

	let hits: number;
	try {
		hits = await redis.incr(key);
		if (hits === 1) await redis.pexpire(key, windowMs * 2);
	} catch (error) {
		// Same as the router limiter: a Redis failure never blocks a creation.
		logger.error(`[rate-limit] customer create counter failed: ${error}`);
		return;
	}

	if (hits <= limit) return;
	logger.warn(
		`[rate-limit] org customer creation cap exceeded: ${ctx.org.slug} (${type})`,
		{ type: "org_rate_cap_exceeded", limitType: type, org: ctx.org.slug },
	);
	throw new RecaseError({
		message: "Rate limit exceeded.",
		code: "rate_limit_exceeded",
		statusCode: 429,
	});
};
