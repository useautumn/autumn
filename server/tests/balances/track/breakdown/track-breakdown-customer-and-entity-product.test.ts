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

const messagesItem = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
	interval: ProductItemInterval.Month,
});

const freeProd = constructProduct({
	type: "free",
	id: "shared-prod",
	isDefault: false,
	items: [messagesItem],
});

const testCase = "track-breakdown-cus-and-entity-prod";

describe(`${chalk.yellowBright("track-breakdown-cus-and-entity-prod: customer + entity both have product")}`, () => {
	const customerId = testCase;
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

	const entity = {
		id: `${testCase}-user-1`,
		name: "User 1",
		feature_id: TestFeature.Users,
	};

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

		await autumnV2.entities.create(customerId, [entity]);

		await autumnV2.attach({
			customer_id: customerId,
			entity_id: entity.id,
			product_id: freeProd.id,
		});
	});

	test.skipIf(isBalanceWorkerRoute())(
		"customer level: 200 total with 2 breakdown items",
		async () => {
			const res = (await autumnV2.check<CheckResponseV2>({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
			})) as unknown as CheckResponseV2;

			expect(res.balance).toMatchObject({
				granted_balance: 200,
				current_balance: 200,
				usage: 0,
			});
		},
	);

	test("entity level: 200 total with 2 breakdown items (inherits customer)", async () => {
		const res = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			entity_id: entity.id,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.balance).toMatchObject({
			granted_balance: 200,
			current_balance: 200,
			usage: 0,
		});

		expect(res.balance?.breakdown).toHaveLength(2);
	});

	test("track 50 at entity level: deducts from entity's breakdown first", async () => {
		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			entity_id: entity.id,
			feature_id: TestFeature.Messages,
			value: 50,
		});

		expect(trackRes.balance).toMatchObject({
			granted_balance: 200,
			current_balance: 150,
			usage: 50,
		});

		const customerRes = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		if (!isBalanceWorkerRoute()) {
			expect(customerRes.balance?.current_balance).toBe(150);
			expect(customerRes.balance?.usage).toBe(50);
		}
	});

	test("track 120 more at entity level: spills into customer's breakdown", async () => {
		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			entity_id: entity.id,
			feature_id: TestFeature.Messages,
			value: 120,
		});

		expect(trackRes.balance).toMatchObject({
			granted_balance: 200,
			current_balance: 30,
			usage: 170,
		});

		const customerRes = (await autumnV2.check<CheckResponseV2>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(customerRes.balance?.current_balance).toBe(30);
	});
});
