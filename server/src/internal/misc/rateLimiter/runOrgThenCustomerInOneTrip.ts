import type { Context, Env, Next } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { RATE_LIMIT_CONFIGS, type RateLimitType } from "./rateLimitConfigs";
import { createRateLimitOptions } from "./rateLimitFactory";
import {
	createCountedHitStore,
	incrementOrgThenCustomer,
} from "./rateLimitPairStore";

/** The org and customer limiters for two Redis buckets, counted in one Redis call; same keys and outcomes. */
export const runOrgThenCustomerInOneTrip = async ({
	c,
	next,
	type,
	orgType,
	overLimit,
	key,
	orgKey,
}: {
	c: Context<HonoEnv>;
	next: Next;
	type: RateLimitType;
	orgType: RateLimitType;
	overLimit?: "degrade";
	key: string;
	orgKey: string;
}) => {
	const orgOptions = createRateLimitOptions({
		type: orgType,
		config: RATE_LIMIT_CONFIGS[orgType],
		overLimit,
	});
	const options = createRateLimitOptions({
		type,
		config: RATE_LIMIT_CONFIGS[type],
	});

	// A degraded org still runs the customer limiter, so the customer is counted too.
	const hits = await incrementOrgThenCustomer({
		org: {
			key: orgKey,
			windowMs: orgOptions.windowMs,
			limit: orgOptions.limit(c),
		},
		customer: { key, windowMs: options.windowMs },
		countCustomerOverOrgLimit: overLimit === "degrade",
	});

	const orgLimiter = rateLimiter<Env>({
		...orgOptions,
		keyGenerator: () => orgKey,
		store: createCountedHitStore({ key: orgKey, hit: hits.org }),
	});

	let innerResponse: Response | undefined;
	const orgResponse = await orgLimiter(c as Context<Env>, async () => {
		if (!hits.customer)
			throw new Error("customer hit missing under the org cap");
		const customerLimiter = rateLimiter<Env>({
			...options,
			keyGenerator: () => key,
			store: createCountedHitStore({ key, hit: hits.customer }),
		});
		innerResponse =
			(await customerLimiter(c as Context<Env>, next)) ?? undefined;
	});

	return orgResponse ?? innerResponse;
};
