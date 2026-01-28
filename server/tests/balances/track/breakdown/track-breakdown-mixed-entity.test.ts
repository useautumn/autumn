import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	type CheckResponseV2,
	ProductItemInterval,
	type TrackResponseV2,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

/**
 * Test 3.1: Mixed per-entity feature + entity products
 * - Product A: 100 messages per-entity (attached to customer, shared entitlement)
 * - Product B: 50 messages (attached directly to entity-1)
 * - Product C: 50 messages (attached directly to entity-2)
 *
 * Expected breakdown at customer level:
 * - 1 breakdown for per-entity product (shared customer_entitlement_id, aggregated)
 * - 1 breakdown for entity-1's product (unique customer_entitlement_id)
 * - 1 breakdown for entity-2's product (unique customer_entitlement_id)
 * Total: 3 breakdown items
 */

const perEntityMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	interval: ProductItemInterval.Month,
	entityFeatureId: TestFeature.Users, // Per entity
});

const entityProductMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 50,
	interval: ProductItemInterval.Month,
});

const perEntityProd = constructProduct({
	type: "free",
	id: "per-entity-prod",
	isDefault: false,
	items: [perEntityMessages],
});

const entityProd = constructProduct({
	type: "free",
	id: "entity-prod",
	isDefault: false,
	items: [entityProductMessages],
});

const testCase = "track-breakdown-mixed-entity";

describe(`${chalk.yellowBright("track-breakdown-mixed-entity: per-entity + entity products")}`, () => {
	const customerId = testCase;
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	const entities = [
		{ id: `${testCase}-user-1`, name: "User 1", feature_id: TestFeature.Users },
		{ id: `${testCase}-user-2`, name: "User 2", feature_id: TestFeature.Users },
	];

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: false,
		});

		await initProductsV0({
			ctx,
			products: [perEntityProd, entityProd],
			prefix: testCase,
		});

		// Attach per-entity product to customer
		await autumnV2.attach({
			customer_id: customerId,
			product_id: perEntityProd.id,
		});

		// Create entities
		await autumnV2.entities.create(customerId, entities);

		// Attach entity product directly to each entity
		for (const entity of entities) {
			await autumnV2.attach({
				customer_id: customerId,
				entity_id: entity.id,
				product_id: entityProd.id,
			});
		}
	});

	test("initial: customer has 300 total with 3 breakdown items", async () => {
		// Per-entity: 100 * 2 entities = 200
		// Entity products: 50 * 2 = 100
		// Total: 300

		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.balance).toMatchObject({
			granted_balance: 300,
			current_balance: 300,
			usage: 0,
		});

		// Should have 3 breakdown items:
		// 1 for per-entity (aggregated, 200 total)
		// 2 for entity products (50 each)
		expect(res.balance?.breakdown).toHaveLength(3);

		const breakdowns = res.balance?.breakdown ?? [];
		const balances = breakdowns
			.map((b) => b.granted_balance)
			.sort((a, b) => (a ?? 0) - (b ?? 0));
		expect(balances).toEqual([50, 50, 200]);

		// All IDs should be unique (different customer_entitlement_ids)
		const ids = breakdowns.map((b) => b.id);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(3);
	});

	test("entity-1: has 150 total with 2 breakdown items", async () => {
		// Per-entity portion: 100
		// Entity product: 50
		// Total: 150

		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.balance).toMatchObject({
			granted_balance: 150,
			current_balance: 150,
			usage: 0,
		});

		// Entity should have 2 breakdowns
		expect(res.balance?.breakdown).toHaveLength(2);

		const balances = res.balance?.breakdown
			?.map((b) => b.granted_balance)
			.sort((a, b) => (a ?? 0) - (b ?? 0));
		expect(balances).toEqual([50, 100]);
	});

	test("track 80 on entity-1: deducts from entity's breakdowns", async () => {
		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 80,
		});

		expect(trackRes.balance).toMatchObject({
			granted_balance: 150,
			current_balance: 70,
			usage: 80,
		});

		// Entity-1 breakdown sum should be 70
		expect(trackRes.balance?.breakdown).toHaveLength(2);
		const entitySum =
			trackRes.balance?.breakdown?.reduce(
				(sum, b) => sum + (b.current_balance ?? 0),
				0,
			) ?? 0;
		expect(entitySum).toBe(70);

		// Customer should reflect deduction
		const customerRes = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(customerRes.balance).toMatchObject({
			granted_balance: 300,
			current_balance: 220,
			usage: 80,
		});

		// Customer still has 3 breakdowns
		expect(customerRes.balance?.breakdown).toHaveLength(3);
	});

	test("entity-2 should be unaffected", async () => {
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.balance).toMatchObject({
			granted_balance: 150,
			current_balance: 150,
			usage: 0,
		});
	});
});
