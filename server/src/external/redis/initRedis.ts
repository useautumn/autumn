import { Redis } from "ioredis";
import { loadCaCert } from "./loadCaCert.js";

if (!process.env.CACHE_URL) {
	throw new Error("CACHE_URL (redis) is not set");
}

let redis: Redis;

const caText = await loadCaCert({
	caPath: process.env.CACHE_CERT_PATH,
	caValue: process.env.CACHE_CERT,
	type: "cache",
});

redis = new Redis(process.env.CACHE_URL, {
	tls: caText ? { ca: caText } : undefined,
});

redis.on("error", (error) => {
	// logger.error(`redis (cache) error: ${error.message}`);
});

export { redis };
// export const redis = new Redis(process.env.CACHE_URL, {
// 	tls: {
// 		ca: process.env.CACHE_CA,
// 	},
// });
