import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type CheckResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

/**
 * Test: Entity products breakdown (check)
 * - Product gives 100 messages (attached directly to each entity)
 * - 3 entities created, each with their own product attachment
 * - Customer should have 300 total with 3 breakdown items (one per entity)
 * - Each entity should have 100 with 1 breakdown item
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

const testCase = "check-entity-products-breakdown1";

describe(`${chalk.yellowBright("check-entity-products-breakdown1: entity products breakdown")}`, () => {
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

	test("customer should have 300 total with 3 breakdown items (one per entity)", async () => {
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		// 3 entities x 100 = 300
		expect(res.balance).toMatchObject({
			granted_balance: 300,
			current_balance: 300,
			usage: 0,
			purchased_balance: 0,
		});

		// Should have 3 breakdown items (one per entity product)
		expect(res.balance?.breakdown).toHaveLength(3);

		// Each breakdown item should have 100 balance
		for (const breakdown of res.balance?.breakdown ?? []) {
			expect(breakdown).toMatchObject({
				granted_balance: 100,
				current_balance: 100,
				usage: 0,
				purchased_balance: 0,
				plan_id: freeProd.id,
			});
			// Each breakdown should have a unique id (customer_entitlement_id)
			expect(breakdown.id).toBeTruthy();
		}

		// All breakdown IDs should be unique
		const ids = res.balance?.breakdown?.map((b) => b.id) ?? [];
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(3);
	});

	test("each entity should have 100 balance with 1 breakdown item", async () => {
		for (const entity of entities) {
			const res = (await autumnV2.check<CheckResponseV2>({
				customer_id: customerId,
				entity_id: entity.id,
				feature_id: TestFeature.Messages,
			})) as unknown as CheckResponseV2;

			expect(res.balance).toMatchObject({
				granted_balance: 100,
				current_balance: 100,
				usage: 0,
				purchased_balance: 0,
				plan_id: freeProd.id,
			});

			// Each entity should have 1 breakdown item
			expect(res.balance?.breakdown).toHaveLength(1);

			const breakdown = res.balance?.breakdown?.[0];
			expect(breakdown).toMatchObject({
				granted_balance: 100,
				current_balance: 100,
				usage: 0,
				purchased_balance: 0,
				plan_id: freeProd.id,
			});
		}
	});

	test("sum of entity balances should equal customer balance", async () => {
		const customerRes = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		let sumEntityBalance = 0;
		for (const entity of entities) {
			const entityRes = (await autumnV2.check<CheckResponseV2>({
				customer_id: customerId,
				entity_id: entity.id,
				feature_id: TestFeature.Messages,
			})) as unknown as CheckResponseV2;

			sumEntityBalance += entityRes.balance?.current_balance ?? 0;
		}

		expect(sumEntityBalance).toBe(300);
		expect(customerRes.balance?.current_balance).toBe(300);
	});

	test("sum of breakdown balances should equal total balance", async () => {
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		const breakdownSum =
			res.balance?.breakdown?.reduce(
				(sum, b) => sum + (b.current_balance ?? 0),
				0,
			) ?? 0;

		expect(breakdownSum).toBe(300);
		expect(res.balance?.current_balance).toBe(breakdownSum);
	});
});
