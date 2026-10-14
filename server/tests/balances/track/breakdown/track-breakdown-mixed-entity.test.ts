import { beforeAll, describe, expect, test } from "bun:test";
import {
	ApiVersion,
	type CheckResponseV2,
	ProductItemInterval,
	type TrackResponseV2,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const perEntityMessages = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	interval: ProductItemInterval.Month,
	entityFeatureId: TestFeature.Users,
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

		await autumnV2.attach({
			customer_id: customerId,
			product_id: perEntityProd.id,
		});

		await autumnV2.entities.create(customerId, entities);

		for (const entity of entities) {
			await autumnV2.attach({
				customer_id: customerId,
				entity_id: entity.id,
				product_id: entityProd.id,
			});
		}
	});

	test.skipIf(isBalanceWorkerRoute())(
		"initial: customer has 300 total with 3 breakdown items",
		async () => {
			const res = (await autumnV2.check<CheckResponseV2>({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
			})) as unknown as CheckResponseV2;

			expect(res.balance).toMatchObject({
				granted_balance: 300,
				current_balance: 300,
				usage: 0,
			});
		},
	);

	test("entity-1: has 150 total with 2 breakdown items", async () => {
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

		expect(trackRes.balance?.breakdown).toHaveLength(2);
		const entitySum =
			trackRes.balance?.breakdown?.reduce(
				(sum, b) => sum + (b.current_balance ?? 0),
				0,
			) ?? 0;
		expect(entitySum).toBe(70);

		const customerRes = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		if (!isBalanceWorkerRoute()) {
			expect(customerRes.balance).toMatchObject({
				granted_balance: 300,
				current_balance: 220,
				usage: 80,
			});
		}
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
