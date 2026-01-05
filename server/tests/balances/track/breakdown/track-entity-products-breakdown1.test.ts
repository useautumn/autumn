import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomer,
	ApiVersion,
	type CheckResponseV2,
	type TrackResponseV2,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

/**
 * Test: Entity products breakdown with tracking
 * - Product gives 100 messages (attached directly to each entity)
 * - 3 entities created, each with their own product attachment
 * - Track on entity level, verify breakdown is correct for both entity and customer
 * - Customer should have 3 breakdown items, each tracking independently
 */

const messagesItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
});

const freeProd = constructProduct({
	type: "free",
	id: "entity-prod",
	isDefault: false,
	items: [messagesItem],
});

const testCase = "track-entity-products-breakdown1";

describe(`${chalk.yellowBright("track-entity-products-breakdown1: entity products breakdown with tracking")}`, () => {
	const customerId = testCase;
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	const entities = [
		{ id: `${testCase}-user-1`, name: "User 1", feature_id: TestFeature.Users },
		{ id: `${testCase}-user-2`, name: "User 2", feature_id: TestFeature.Users },
		{ id: `${testCase}-user-3`, name: "User 3", feature_id: TestFeature.Users },
	];

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [freeProd],
			prefix: testCase,
		});

		// Create entities first
		await autumnV2.entities.create(customerId, entities);

		// Attach product to each entity (entity products)
		for (const entity of entities) {
			await autumnV2.attach({
				customer_id: customerId,
				entity_id: entity.id,
				product_id: freeProd.id,
			});
		}
	});

	test("initial: customer has 300 with 3 breakdowns, each entity has 100 with 1 breakdown", async () => {
		const customerRes = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(customerRes.balance).toMatchObject({
			granted_balance: 300,
			current_balance: 300,
			usage: 0,
		});

		// Customer should have 3 breakdown items (one per entity product)
		expect(customerRes.balance?.breakdown).toHaveLength(3);

		for (const entity of entities) {
			const entityRes = (await autumnV2.check<CheckResponseV2>({
				customer_id: customerId,
				entity_id: entity.id,
				feature_id: TestFeature.Messages,
			})) as unknown as CheckResponseV2;

			expect(entityRes.balance).toMatchObject({
				granted_balance: 100,
				current_balance: 100,
				usage: 0,
			});
			expect(entityRes.balance?.breakdown).toHaveLength(1);
		}
	});

	test("track 30 on entity-1: only that entity's breakdown is affected", async () => {
		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 30,
		});

		// Track response should show entity balance
		expect(trackRes.balance).toMatchObject({
			granted_balance: 100,
			current_balance: 70,
			usage: 30,
		});

		// Entity should have 1 breakdown with deduction
		expect(trackRes.balance?.breakdown).toHaveLength(1);
		expect(trackRes.balance?.breakdown?.[0]).toMatchObject({
			granted_balance: 100,
			current_balance: 70,
			usage: 30,
		});

		// Verify customer balance reflects deduction
		const customerRes = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(customerRes.balance).toMatchObject({
			granted_balance: 300,
			current_balance: 270,
			usage: 30,
		});

		// Customer should still have 3 breakdowns
		expect(customerRes.balance?.breakdown).toHaveLength(3);

		// One breakdown should have usage=30, others should have usage=0
		const breakdownsWithUsage =
			customerRes.balance?.breakdown?.filter((b) => (b.usage ?? 0) > 0) ?? [];
		expect(breakdownsWithUsage).toHaveLength(1);
		expect(breakdownsWithUsage[0]).toMatchObject({
			granted_balance: 100,
			current_balance: 70,
			usage: 30,
		});

		// Other entities should be unchanged
		for (let i = 1; i < entities.length; i++) {
			const entityRes = (await autumnV2.check<CheckResponseV2>({
				customer_id: customerId,
				entity_id: entities[i].id,
				feature_id: TestFeature.Messages,
			})) as unknown as CheckResponseV2;

			expect(entityRes.balance).toMatchObject({
				granted_balance: 100,
				current_balance: 100,
				usage: 0,
			});
		}
	});

	test("track 50 on entity-2: multiple breakdowns now have usage", async () => {
		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			value: 50,
		});

		expect(trackRes.balance).toMatchObject({
			granted_balance: 100,
			current_balance: 50,
			usage: 50,
		});

		// Verify customer balance
		const customerRes = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(customerRes.balance).toMatchObject({
			granted_balance: 300,
			current_balance: 220,
			usage: 80, // 30 + 50
		});

		// Customer should have 3 breakdowns, 2 with usage
		expect(customerRes.balance?.breakdown).toHaveLength(3);

		const breakdownsWithUsage =
			customerRes.balance?.breakdown?.filter((b) => (b.usage ?? 0) > 0) ?? [];
		expect(breakdownsWithUsage).toHaveLength(2);

		// Verify breakdown usages
		const usages = breakdownsWithUsage.map((b) => b.usage).sort();
		expect(usages).toEqual([30, 50]);
	});

	test("sum of breakdown balances equals customer balance", async () => {
		const customerRes = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		const breakdownCurrentSum =
			customerRes.balance?.breakdown?.reduce(
				(sum, b) => sum + (b.current_balance ?? 0),
				0,
			) ?? 0;

		const breakdownUsageSum =
			customerRes.balance?.breakdown?.reduce(
				(sum, b) => sum + (b.usage ?? 0),
				0,
			) ?? 0;

		expect(breakdownCurrentSum).toBe(220);
		expect(customerRes.balance?.current_balance).toBe(breakdownCurrentSum);

		expect(breakdownUsageSum).toBe(80);
		expect(customerRes.balance?.usage).toBe(breakdownUsageSum);
	});

	test("verify DB sync with skip_cache=true", async () => {
		await timeout(2000);

		// Customer from DB
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId, {
			skip_cache: "true",
		});

		const balance = customer.balances[TestFeature.Messages];
		expect(balance).toMatchObject({
			granted_balance: 300,
			current_balance: 220,
			usage: 80,
		});

		// Should have 3 breakdown items
		expect(balance.breakdown).toHaveLength(3);

		// Verify breakdown sum
		const breakdownSum =
			balance.breakdown?.reduce(
				(sum, b) => sum + (b.current_balance ?? 0),
				0,
			) ?? 0;
		expect(breakdownSum).toBe(220);

		// Each entity from DB
		const entityBalances = [70, 50, 100]; // After tracking
		for (let i = 0; i < entities.length; i++) {
			const entityRes = (await autumnV2.check<CheckResponseV2>({
				customer_id: customerId,
				entity_id: entities[i].id,
				feature_id: TestFeature.Messages,
				skip_cache: true,
			})) as unknown as CheckResponseV2;

			expect(entityRes.balance?.current_balance).toBe(entityBalances[i]);
			expect(entityRes.balance?.breakdown).toHaveLength(1);
			expect(entityRes.balance?.breakdown?.[0]?.current_balance).toBe(
				entityBalances[i],
			);
		}
	});
});
