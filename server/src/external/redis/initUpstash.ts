import { Redis } from "@upstash/redis";

const upstash = new Redis({
	url: process.env.CLOUD_UPSTASH_REDIS_REST_URL,
	token: process.env.CLOUD_UPSTASH_REDIS_REST_TOKEN,
});

export { upstash };
