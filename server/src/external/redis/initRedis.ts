import { Redis } from "ioredis";
import {
	GET_CUSTOMER_SCRIPT,
	getBatchDeductionScript,
	SET_CUSTOMER_SCRIPT,
	SET_ENTITIES_BATCH_SCRIPT,
} from "../../_luaScripts/luaScripts.js";
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
	family: 4,
	keepAlive: 10000,
});

// Load Lua scripts using the builder functions that include dependencies
const batchDeductionScript = getBatchDeductionScript();

// Define commands
redis.defineCommand("batchDeduction", {
	numberOfKeys: 0,
	lua: batchDeductionScript,
});

redis.defineCommand("getCustomer", {
	numberOfKeys: 0,
	lua: GET_CUSTOMER_SCRIPT,
});

redis.defineCommand("setCustomer", {
	numberOfKeys: 0,
	lua: SET_CUSTOMER_SCRIPT,
});

redis.defineCommand("setEntitiesBatch", {
	numberOfKeys: 0,
	lua: SET_ENTITIES_BATCH_SCRIPT,
});

// Add type definitions
declare module "ioredis" {
	interface RedisCommander {
		batchDeduction(
			requestsJson: string,
			orgId: string,
			env: string,
			customerId: string,
			adjustGrantedBalance?: string,
		): Promise<string>;
		getCustomer(
			orgId: string,
			env: string,
			customerId: string,
			skipEntityMerge: string,
		): Promise<string>;
		setCustomer(
			customerData: string,
			orgId: string,
			env: string,
			customerId: string,
		): Promise<string>;
		setEntitiesBatch(
			entityBatch: string,
			orgId: string,
			env: string,
		): Promise<string>;
	}
}

// biome-ignore lint/correctness/noUnusedFunctionParameters: Might uncomment this back in in the future
redis.on("error", (error) => {
	// logger.error(`redis (cache) error: ${error.message}`);
});

export { redis };
