import { Redis } from "ioredis";
import { isTwWorkerMode } from "./twStripeMode";

let redis: Redis | undefined;

export const getTwStripeRedis = (): Redis => {
	if (!isTwWorkerMode()) throw new Error("Stripe test limiter is disabled");
	if (redis) return redis;
	const url = process.env.TW_STRIPE_REDIS_URL;
	if (!url)
		throw new Error(
			"TW_STRIPE_REDIS_URL is required for the shared Stripe budget",
		);
	redis = new Redis(url, {
		connectTimeout: 2000,
		commandTimeout: 2000,
		maxRetriesPerRequest: 0,
		autoResendUnfulfilledCommands: false,
		retryStrategy: null,
	});
	// Command promises report failures without printing connection details.
	redis.on("error", () => {});
	return redis;
};
