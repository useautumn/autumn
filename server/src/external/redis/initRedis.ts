import { Redis } from "ioredis";
import { loadCaCert } from "./loadCaCert.js";

if (!process.env.CACHE_URL) {
	throw new Error("CACHE_URL (redis) is not set");
}

const regionToCacheUrl: Record<string, string | undefined> = {
	"us-east-2": process.env.CACHE_URL_US_EAST,
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

const redis = new Redis(regionalCacheUrl || process.env.CACHE_URL, {
	tls: caText ? { ca: caText } : undefined,
});

redis.on("error", (error) => {
	// logger.error(`redis (cache) error: ${error.message}`);
});

export { redis };
