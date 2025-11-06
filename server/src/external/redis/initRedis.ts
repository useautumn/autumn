import { Redis } from "ioredis";
import { loadCaCert } from "./loadCaCert.js";

if (!process.env.CACHE_URL) {
	throw new Error("CACHE_URL (redis) is not set");
}

let redis: Redis;

const regionToCacheUrl: Record<string, string | undefined> = {
	"us-east": process.env.CACHE_URL_US_EAST,
};

const awsRegion = process.env.AWS_REGION as keyof typeof regionToCacheUrl;
const regionalCacheUrl = regionToCacheUrl[awsRegion];
if (regionalCacheUrl) {
	console.log(`Using regional cache: ${awsRegion}`);
}

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
