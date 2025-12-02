import { Redis } from "@upstash/redis";

console.log(
	"CLOUD_UPSTASH_REDIS_REST_URL",
	process.env.CLOUD_UPSTASH_REDIS_REST_URL,
);
console.log(
	"CLOUD_UPSTASH_REDIS_REST_TOKEN",
	process.env.CLOUD_UPSTASH_REDIS_REST_TOKEN,
);

const upstash = new Redis({
	url: process.env.CLOUD_UPSTASH_REDIS_REST_URL,
	token: process.env.CLOUD_UPSTASH_REDIS_REST_TOKEN,
});

export { upstash };
