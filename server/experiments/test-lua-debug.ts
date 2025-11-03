import { globalBatchingManager } from "../src/internal/balances/track/redisTrackUtils/BatchingManager.js";

/**
 * Test script to debug the simplified batchDeduction.lua
 * This will show you what the Lua script can retrieve about a feature
 */
async function testLuaDebug() {
	// Replace these with real values from your test data
	const customerId = "your-customer-id";
	const orgId = "your-org-id";
	const env = "development";

	console.log("Testing Lua script with:");
	console.log("- Customer ID:", customerId);
	console.log("- Org ID:", orgId);
	console.log("- Environment:", env);
	console.log("");

	try {
		const result = await globalBatchingManager.deduct({
			customerId,
			featureDeductions: [
				{ featureId: "credits", amount: 10 },
				{ featureId: "api_calls", amount: 5 },
			],
			orgId,
			env,
			overageBehavior: "cap",
		});

		console.log("📦 Batching manager result:");
		console.log(JSON.stringify(result, null, 2));
	} catch (error) {
		console.error("❌ Error:", error);
	}

	process.exit(0);
}

testLuaDebug();

