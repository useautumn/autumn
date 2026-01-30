import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, ProductItemFeatureType } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	constructArrearItem,
	constructFeatureItem,
} from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { timeout } from "../../../utils/genUtils.js";

const testCase = "concurrentTrack5";
const customerId = testCase;

const seatItem = constructFeatureItem({
	featureId: TestFeature.Users,
	includedUsage: 5,
	featureType: ProductItemFeatureType.ContinuousUse,
});

const perSeatMessagesItem = constructArrearItem({
	featureId: TestFeature.Messages,
	entityFeatureId: TestFeature.Users,
	price: 0.01,
	includedUsage: 500,
	usageLimit: 600,
});

const pro = constructProduct({
	id: "pro",
	items: [seatItem, perSeatMessagesItem],
	type: "pro",
});

describe(`${chalk.yellowBright(`${testCase}: Testing per-entity track with concurrent requests`)}`, () => {
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
		});

		// Attach product to customer
		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});
	});

	test("should create 5 seats each with 500 messages", async () => {
		const customer = await autumnV1.customers.get(customerId);
		const seatBalance = customer.features[TestFeature.Users].balance;
		expect(seatBalance).toBe(5);

		// Create 5 entities (seats)
		const entities = [
			{ id: "seat1", name: "Seat 1" },
			{ id: "seat2", name: "Seat 2" },
			{ id: "seat3", name: "Seat 3" },
			{ id: "seat4", name: "Seat 4" },
			{ id: "seat5", name: "Seat 5" },
		];

		for (const entity of entities) {
			await autumnV1.entities.create(customerId, {
				id: entity.id,
				name: entity.name,
				feature_id: TestFeature.Users,
			});
		}

		// Verify each seat has 500 messages
		for (const entity of entities) {
			const entityRes = await autumnV1.entities.get(customerId, entity.id);
			expect(entityRes.features![TestFeature.Messages].balance).toBe(500);
		}

		// Verify customer has 500 * 5 = 2500 messages
		const customerRes = await autumnV1.customers.get(customerId);

		expect(customerRes.features[TestFeature.Messages]).toBeDefined();
		expect(customerRes.features[TestFeature.Messages].balance).toBe(
			500 * entities.length,
		);
	});

	test("should enforce usage_limit of 600 per seat with concurrent 200-unit requests", async () => {
		const entityId = "seat1";

		// Verify seat1 has 500 included messages with 600 usage_limit
		const entityRes = await autumnV1.entities.get(customerId, entityId);
		expect(entityRes.features![TestFeature.Messages].balance).toBe(500);

		console.log(
			"🚀 Starting 5 concurrent track calls (200 units each) for seat1...",
		);
		console.log(
			`   Initial state: balance=${entityRes.features![TestFeature.Messages].balance}, usage_limit=${entityRes.features![TestFeature.Messages].usage_limit}`,
		);

		// Try 5 concurrent 200-unit sends to seat1
		// With usage_limit of 600, only 3 should succeed (3×200=600 <= 600)
		const promises = [
			autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				entity_id: entityId,
				value: 200,
				overage_behavior: "reject",
			}),
			autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				entity_id: entityId,
				value: 200,
				overage_behavior: "reject",
			}),
			autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				entity_id: entityId,
				value: 200,
				overage_behavior: "reject",
			}),
			autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				entity_id: entityId,
				value: 200,
				overage_behavior: "reject",
			}),
			autumnV1.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				entity_id: entityId,
				value: 200,
				overage_behavior: "reject",
			}),
		];

		const results = await Promise.allSettled(promises);

		const successCount = results.filter((r) => r.status === "fulfilled").length;
		const rejectedCount = results.filter((r) => r.status === "rejected").length;
		console.log(
			`\n📈 Summary: ${successCount} successful tracks, ${rejectedCount} rejected tracks`,
		);

		expect(successCount).toBe(3);
		expect(rejectedCount).toBe(2);

		// Get final state
		const finalEntityRes = await autumnV1.entities.get(customerId, entityId);
		console.log(`\n📦 Final state for ${entityId}:`);
		console.log(
			`- Balance: ${finalEntityRes.features![TestFeature.Messages].balance} (expected: -100)`,
		);
		console.log(
			`- Usage: ${finalEntityRes.features![TestFeature.Messages].usage} (expected: 600)`,
		);
		console.log(
			`- Usage limit: ${finalEntityRes.features![TestFeature.Messages].usage_limit} (expected: 600)`,
		);

		expect(finalEntityRes.features![TestFeature.Messages].balance).toBe(-100);
		expect(finalEntityRes.features![TestFeature.Messages].usage).toBe(600);

		// Verify other seats remain untouched at 500
		for (const seatId of ["seat2", "seat3", "seat4", "seat5"]) {
			const otherSeatRes = await autumnV1.entities.get(customerId, seatId);
			expect(otherSeatRes.features![TestFeature.Messages].balance).toBe(500);
		}
	});

	test("should reflect concurrent per-entity deductions in non-cached customer after 2s", async () => {
		const entityId = "seat1";

		// Expected: 3 successful requests × 200 units each = 600 units used
		// Starting balance: 500, usage: 600, final balance: 500 - 600 = -100

		// Wait 2 seconds for DB sync
		await timeout(2000);

		// Fetch entity with skip_cache=true
		const finalEntityRes = await autumnV1.entities.get(customerId, entityId, {
			skip_cache: "true",
		});

		expect(finalEntityRes.features![TestFeature.Messages].balance).toBe(-100);
		expect(finalEntityRes.features![TestFeature.Messages].usage).toBe(600);
		expect(finalEntityRes.features![TestFeature.Messages].usage_limit).toBe(
			600,
		);

		// Verify other seats still at 500 in database
		for (const seatId of ["seat2", "seat3", "seat4", "seat5"]) {
			const otherSeatRes = await autumnV1.entities.get(customerId, seatId, {
				skip_cache: "true",
			});
			expect(otherSeatRes.features![TestFeature.Messages].balance).toBe(500);
		}
	});
});
