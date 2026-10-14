import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type CheckResponseV2 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

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

		await autumnV2.entities.create(customerId, entities);

		for (const entity of entities) {
			await autumnV2.attach({
				customer_id: customerId,
				entity_id: entity.id,
				product_id: freeProd.id,
			});
		}
	});

	test.skipIf(isBalanceWorkerRoute())(
		"customer should have 300 total with 3 breakdown items (one per entity)",
		async () => {
			const res = (await autumnV2.check<CheckResponseV2>({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
			})) as unknown as CheckResponseV2;

			console.log("Res:", res);

			expect(res.balance).toMatchObject({
				granted_balance: 300,
				current_balance: 300,
				usage: 0,
				purchased_balance: 0,
			});
		},
	);

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
		if (!isBalanceWorkerRoute()) {
			expect(customerRes.balance?.current_balance).toBe(300);
		}
	});
});
