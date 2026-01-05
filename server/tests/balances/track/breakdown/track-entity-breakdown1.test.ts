import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomer,
	ApiVersion,
	type CheckResponseV2,
	ProductItemInterval,
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
 * Test: Per-entity messages breakdown with tracking
 * - Product gives 100 messages per entity (monthly)
 * - 3 entities created
 * - Track on entity level, verify breakdown is correct for both entity and customer
 */

const perEntityMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	interval: ProductItemInterval.Month,
	entityFeatureId: TestFeature.Users, // Per entity
});

const freeProd = constructProduct({
	type: "free",
	id: "per-entity-prod",
	isDefault: false,
	items: [perEntityMessages],
});

const testCase = "track-entity-breakdown1";

describe(`${chalk.yellowBright("track-entity-breakdown1: per-entity messages breakdown with tracking")}`, () => {
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

		await autumnV2.attach({
			customer_id: customerId,
			product_id: freeProd.id,
		});

		await autumnV2.entities.create(customerId, entities);
	});

	test("initial: customer has 300, each entity has 100", async () => {
		const customerRes = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(customerRes.balance).toMatchObject({
			granted_balance: 300,
			current_balance: 300,
			usage: 0,
		});

		expect(customerRes.balance?.breakdown).toHaveLength(1);

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

	test("track 30 on entity-1: entity-1 has 70, customer has 270", async () => {
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
			purchased_balance: 0,
		});

		// Verify entity-1 breakdown
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

		// Customer breakdown should also reflect the deduction
		expect(customerRes.balance?.breakdown).toHaveLength(1);
		expect(customerRes.balance?.breakdown?.[0]).toMatchObject({
			granted_balance: 300,
			current_balance: 270,
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

	test("track 50 on entity-2: entity-2 has 50, customer has 220", async () => {
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

		// Verify entity-2 breakdown
		expect(trackRes.balance?.breakdown).toHaveLength(1);
		expect(trackRes.balance?.breakdown?.[0]).toMatchObject({
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

		expect(customerRes.balance?.breakdown?.[0]).toMatchObject({
			granted_balance: 300,
			current_balance: 220,
			usage: 80,
		});
	});

	test("sum of entity balances equals customer balance", async () => {
		const customerRes = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		let sumEntityBalance = 0;
		let sumEntityUsage = 0;

		for (const entity of entities) {
			const entityRes = (await autumnV2.check<CheckResponseV2>({
				customer_id: customerId,
				entity_id: entity.id,
				feature_id: TestFeature.Messages,
			})) as unknown as CheckResponseV2;

			sumEntityBalance += entityRes.balance?.current_balance ?? 0;
			sumEntityUsage += entityRes.balance?.usage ?? 0;
		}

		// Entity-1: 70, Entity-2: 50, Entity-3: 100 = 220
		expect(sumEntityBalance).toBe(220);
		expect(customerRes.balance?.current_balance).toBe(220);

		// Usage: 30 + 50 + 0 = 80
		expect(sumEntityUsage).toBe(80);
		expect(customerRes.balance?.usage).toBe(80);
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

		expect(balance.breakdown).toHaveLength(1);
		expect(balance.breakdown?.[0]).toMatchObject({
			granted_balance: 300,
			current_balance: 220,
			usage: 80,
		});

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
