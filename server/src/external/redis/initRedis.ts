import { Redis } from "ioredis";
import { loadCaCert } from "./loadCaCert.js";

if (!process.env.CACHE_URL) {
	throw new Error("CACHE_URL (redis) is not set");
}

let redis: Redis;

const regionToCacheUrl = {
	"us-east4-eqdc4a": process.env.US_EAST_CACHE,
	"us-west2": process.env.US_WEST_CACHE,
};

const replicaRegion = process.env
	.RAILWAY_REPLICA_REGION as keyof typeof regionToCacheUrl;

const regionalCacheUrl = regionToCacheUrl[replicaRegion];

console.log("RAILWAY REPLICA REGION:", process.env.RAILWAY_REPLICA_REGION);
console.log(`REGIONAL CACHE EXISTS: ${regionalCacheUrl ? "YES" : "NO"}`);

const caText = await loadCaCert({
	caPath: process.env.CACHE_CERT_PATH,
	caValue: process.env.CACHE_CERT,
	type: "cache",
});

redis = new Redis(regionalCacheUrl || process.env.CACHE_URL, {
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
