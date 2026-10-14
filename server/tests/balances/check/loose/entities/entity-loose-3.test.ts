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

const messagesFeature = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [messagesFeature],
});

const testCase = "entity-loose3";
const customerId = testCase;
const entityId = `${testCase}-user-1`;

describe(`${chalk.yellowBright(`${testCase}: entity with product + loose entitlement`)}`, () => {
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });

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

		await autumnV1.entities.create(customerId, [
			{
				id: entityId,
				name: "User 1",
				feature_id: TestFeature.Users,
			},
		]);

		await autumnV1.attach({
			customer_id: customerId,
			product_id: freeProd.id,
		});

		await autumnV1.balances.create({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entityId,
			granted_balance: 500,
		});
	});

	test("v2: entity check should include customer product + entity loose ent", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entityId,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		expect(res.entity_id).toBe(entityId);
		expect(res.balance).toBeDefined();

		expect(res.balance?.granted_balance).toBe(600);
		expect(res.balance?.current_balance).toBe(600);

		expect(res.balance?.breakdown).toBeDefined();
		expect(res.balance?.breakdown).toHaveLength(2);
	});

	test("v2: customer-level check should see merged balances", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		if (!isBalanceWorkerRoute()) {
			expect(res.balance?.granted_balance).toBe(600);
			expect(res.balance?.current_balance).toBe(600);
		}
	});

	test("v2: entity breakdown should show both sources", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: entityId,
		})) as unknown as CheckResponseV2;

		const breakdown = res.balance?.breakdown;
		expect(breakdown).toBeDefined();
		expect(breakdown).toHaveLength(2);

		const productEnt = breakdown?.find((b) => b.plan_id === freeProd.id);
		expect(productEnt).toBeDefined();
		expect(productEnt?.granted_balance).toBe(100);

		const looseEnt = breakdown?.find((b) => b.plan_id === null);
		expect(looseEnt).toBeDefined();
		expect(looseEnt?.granted_balance).toBe(500);
	});
});
