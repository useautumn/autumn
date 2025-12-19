import { beforeAll, describe, expect, it } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { redis } from "@/external/redis/initRedis.js";
import { timeout } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const pro = constructProduct({
	type: "pro",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
});

const premium = constructProduct({
	type: "premium",
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 300,
		}),
	],
});

const testCase = "attach-misc3";

describe(`${chalk.yellowBright("attach-misc3: timestamp-based stale write prevention test")}`, () => {
	const customerId = testCase;
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [pro, premium],
			prefix: testCase,
		});
	});

	it("should block stale writes (fetchTimeMs < deletionTime) and allow fresh writes", async () => {
		// Step 1: Attach pro product (this will cache the customer)
		console.log("\n--- Step 1: Attach pro product ---");
		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		// Verify pro is attached
		const beforeCustomer = await autumnV1.customers.get(customerId);
		expect(beforeCustomer.products?.[0]?.id).toBe(pro.id);
		console.log("Pro product attached");

		// Step 2: Record a "stale" fetch time (before deletion)
		const staleFetchTimeMs = Date.now();
		console.log(
			`\n--- Step 2: Recorded stale fetch time: ${staleFetchTimeMs} ---`,
		);

		// Small delay to ensure deletion timestamp is definitely after fetch time
		await timeout(50);

		// Step 3: Delete cache (this sets the guard with current timestamp)
		console.log("\n--- Step 3: Delete cache (sets guard with timestamp) ---");
		const deletedCount = await redis.deleteCustomer(
			ctx.org.id,
			ctx.env,
			customerId,
		);
		console.log(`Deleted ${deletedCount} cache keys`);

		// Step 4: Try to write with STALE fetch time (before deletion)
		console.log("\n--- Step 4: Try to write cache with stale fetchTimeMs ---");
		const fakeOldCustomerData = {
			id: customerId,
			name: "Test Customer",
			email: null,
			created_at: Date.now(),
			fingerprint: null,
			stripe_id: null,
			env: ctx.env,
			metadata: {},
			subscriptions: [{ plan_id: pro.id, status: "active" }], // OLD product!
			scheduled_subscriptions: [],
			invoices: [],
			balances: {},
			entities: [],
		};

		const writeResult = await redis.setCustomer(
			JSON.stringify(fakeOldCustomerData),
			ctx.org.id,
			ctx.env,
			customerId,
			staleFetchTimeMs.toString(), // Stale timestamp - BEFORE deletion
		);

		console.log(`Write result with stale timestamp: ${writeResult}`);

		// Verify write was blocked because fetchTimeMs < deletionTime
		expect(writeResult).toBe("STALE_WRITE");
		console.log("✅ Stale cache write was blocked!");

		// Step 5: Try to write with FRESH fetch time (after deletion)
		console.log("\n--- Step 5: Try to write cache with fresh fetchTimeMs ---");
		const freshFetchTimeMs = Date.now(); // This is AFTER the deletion

		const writeResult2 = await redis.setCustomer(
			JSON.stringify(fakeOldCustomerData),
			ctx.org.id,
			ctx.env,
			customerId,
			freshFetchTimeMs.toString(), // Fresh timestamp - AFTER deletion
		);

		console.log(`Write result with fresh timestamp: ${writeResult2}`);
		expect(writeResult2).toBe("OK");
		console.log("✅ Fresh cache write succeeded!");

		// Step 6: Verify CACHE_EXISTS for subsequent writes
		console.log("\n--- Step 6: Verify CACHE_EXISTS for duplicate writes ---");
		const writeResult3 = await redis.setCustomer(
			JSON.stringify(fakeOldCustomerData),
			ctx.org.id,
			ctx.env,
			customerId,
			Date.now().toString(),
		);

		console.log(`Write result for duplicate: ${writeResult3}`);
		expect(writeResult3).toBe("CACHE_EXISTS");
		console.log("✅ Duplicate write correctly returned CACHE_EXISTS!");

		// Cleanup: Delete the cache we wrote
		await redis.deleteCustomer(ctx.org.id, ctx.env, customerId);
	});
});
