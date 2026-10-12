import { RecaseError } from "@autumn/shared";
import { logger } from "@/external/logtail/logtailUtils.js";
import { shouldUseRedis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	type FixedWindowCounter,
	incrementFixedWindow,
} from "./fixedWindowCounter.js";
import { RATE_LIMIT_CONFIGS, RateLimitType } from "./rateLimitConfigs.js";
import { getOrgRateLimitOverride } from "./rateLimitOverridesStore.js";

const CUSTOMER_CREATE_RATE_LIMITED = "customer_create_rate_limited";

export const isCustomerCreateRateLimitError = (error: unknown) =>
	error instanceof RecaseError && error.code === CUSTOMER_CREATE_RATE_LIMITED;

/** Caps customer creations per org per fixed window; reads that find an existing customer never count. */
export const assertCustomerCreateWithinOrgLimit = async ({
	ctx,
	counter,
	now = Date.now(),
}: {
	ctx: AutumnContext;
	counter?: FixedWindowCounter;
	now?: number;
}) => {
	if (!ctx.org?.id) return;
	if (!counter && !shouldUseRedis()) return;

	const type = RateLimitType.CustomerCreateOrg;
	const { windowMs, limit: defaultLimit } = RATE_LIMIT_CONFIGS[type];
	const limit =
		getOrgRateLimitOverride({
			orgId: ctx.org.id,
			orgSlug: ctx.org.slug,
			type,
		}) ?? defaultLimit;

	let hits: number;
	try {
		hits = await incrementFixedWindow({
			key: `${type}:${ctx.org.id}:${ctx.env}`,
			windowMs,
			counter,
			now,
		});
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
		code: CUSTOMER_CREATE_RATE_LIMITED,
		statusCode: 429,
	});
};
