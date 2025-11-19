import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import {
	CHECK_RATE_LIMIT,
	GENERAL_RATE_LIMIT,
	TRACK_RATE_LIMIT,
} from "./rateLimitConstants";

let upstash: Redis | undefined;
let generalRateLimiter: Ratelimit | undefined;
let trackRateLimiter: Ratelimit | undefined;
let checkRateLimiter: Ratelimit | undefined;

if (
	process.env.UPSTASH_REDIS_REST_URL &&
	process.env.UPSTASH_REDIS_REST_TOKEN
) {
	upstash = new Redis({
		url: process.env.UPSTASH_REDIS_REST_URL ?? "",
		token: process.env.UPSTASH_REDIS_REST_TOKEN ?? "",
	});

	// 1. General rate limiter
	generalRateLimiter = new Ratelimit({
		redis: upstash,
		limiter: Ratelimit.slidingWindow(GENERAL_RATE_LIMIT, "1s"),
	});

	// 2. Track rate limiter
	trackRateLimiter = new Ratelimit({
		redis: upstash,
		limiter: Ratelimit.slidingWindow(TRACK_RATE_LIMIT, "1s"),
	});

	// 3. Check / get customer rate limiter
	checkRateLimiter = new Ratelimit({
		redis: upstash,
		limiter: Ratelimit.slidingWindow(CHECK_RATE_LIMIT, "1s"),
	});
}

export enum RateLimitType {
	General = "general",
	Track = "track",
	Check = "check",
}

export { upstash, generalRateLimiter, trackRateLimiter, checkRateLimiter };
