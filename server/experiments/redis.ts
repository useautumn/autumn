import { Redis } from "ioredis";
import { AutumnInt } from "../src/external/autumn/autumnCli.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";

const client = new Redis("redis://localhost:6379");

// Load Lua scripts
const setCustomerScript = readFileSync(
	join(import.meta.dir, "setCustomer.lua"),
	"utf-8",
);
const getCustomerScript = readFileSync(
	join(import.meta.dir, "getCustomer.lua"),
	"utf-8",
);

// Calculate SHA1 hashes for script caching
const setCustomerSha = crypto
	.createHash("sha1")
	.update(setCustomerScript)
	.digest("hex");
const getCustomerSha = crypto
	.createHash("sha1")
	.update(getCustomerScript)
	.digest("hex");

// Load scripts into Redis
await client.script("LOAD", setCustomerScript);
await client.script("LOAD", getCustomerScript);

/**
 * Atomically stores a customer object in Redis with features as HSETs
 */
async function setCustomer({ customerData }: { customerData: any }) {
	const customerId = customerData.id;
	try {
		const result = await client.evalsha(
			setCustomerSha,
			1,
			customerId,
			JSON.stringify(customerData),
		);
		return result;
	} catch (error: any) {
		// If script not found, reload and retry
		if (error.message.includes("NOSCRIPT")) {
			await client.script("LOAD", setCustomerScript);
			return await client.evalsha(
				setCustomerSha,
				1,
				customerId,
				JSON.stringify(customerData),
			);
		}
		throw error;
	}
}

/**
 * Atomically retrieves a customer object from Redis, reconstructing from HSETs
 */
async function getCustomer({ customerId }: { customerId: string }) {
	try {
		const result = await client.evalsha(getCustomerSha, 1, customerId);
		if (!result) {
			return null;
		}
		return JSON.parse(result as string);
	} catch (error: any) {
		// If script not found, reload and retry
		if (error.message.includes("NOSCRIPT")) {
			await client.script("LOAD", getCustomerScript);
			const retryResult = await client.evalsha(getCustomerSha, 1, customerId);
			if (!retryResult) {
				return null;
			}
			return JSON.parse(retryResult as string);
		}
		throw error;
	}
}

/**
 * Atomically updates a feature balance using HINCRBYFLOAT
 */
async function updateFeatureBalance({
	customerId,
	featureId,
	amount,
	breakdownIndex,
}: {
	customerId: string;
	featureId: string;
	amount: number;
	breakdownIndex?: number;
}) {
	// Update breakdown-specific balance if index provided
	if (breakdownIndex !== undefined) {
		const breakdownKey = `customer:${customerId}:features:${featureId}:breakdown:${breakdownIndex}`;
		await client.hincrbyfloat(breakdownKey, "balance", amount);
	}

	// Always update aggregate feature balance
	const featureKey = `customer:${customerId}:features:${featureId}`;
	await client.hincrbyfloat(featureKey, "balance", amount);
}

/**
 * Atomically updates a feature usage using HINCRBYFLOAT
 */
async function updateFeatureUsage({
	customerId,
	featureId,
	amount,
	breakdownIndex,
}: {
	customerId: string;
	featureId: string;
	amount: number;
	breakdownIndex?: number;
}) {
	// Update breakdown-specific usage if index provided
	if (breakdownIndex !== undefined) {
		const breakdownKey = `customer:${customerId}:features:${featureId}:breakdown:${breakdownIndex}`;
		await client.hincrbyfloat(breakdownKey, "usage", amount);
	}

	// Always update aggregate feature usage
	const featureKey = `customer:${customerId}:features:${featureId}`;
	await client.hincrbyfloat(featureKey, "usage", amount);
}

const main = async () => {
	const autumn = new AutumnInt({ secretKey: process.env.JDEV! });

	const customer = await autumn.customers.get("john");
	
	// 1. Set customer
	const setStart = performance.now();
	await setCustomer({
		customerData: customer,
	});
	const setEnd = performance.now();
	console.log(`✓ Stored customer in Redis (${(setEnd - setStart).toFixed(2)}ms)`);

	// 2. Get customer
	console.time("Get cached customer");
	const cachedCustomer = await getCustomer({ customerId: "john" });
	console.timeEnd("Get cached customer");

	// Compare features
	console.log("\n=== Comparison ===");
  console.log(`Original credits feature balance: `, cachedCustomer?.features?.credits?.balance);

  // Time the decrement of lifetime balance using HDECRBYFLOAT
  console.time("Decrement lifetime balance");
  await client.hincrbyfloat("customer:john:features:credits", "balance", -1.42513);
  console.timeEnd("Decrement lifetime balance");

  // Get updated customer
  const updatedCustomer = await getCustomer({ customerId: "john" });
  console.log('Updated credits feature balance:', updatedCustomer?.features?.credits?.balance);

  // Time getting the customer object
  console.time("Get base customer");
  await client.get("customer:john");
  console.timeEnd("Get base customer");
};

await main();
process.exit(0);