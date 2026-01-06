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

		// Create entity
		await autumnV1.entities.create(customerId, [
			{
				id: entityId,
				name: "User 1",
				feature_id: TestFeature.Users,
			},
		]);

		// Attach product at customer level (gives 100 messages)
		await autumnV1.attach({
			customer_id: customerId,
			product_id: freeProd.id,
		});

		// Add loose entitlement for entity (adds 500 more just for entity)
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

		// Entity should see: 100 (from customer product) + 500 (entity loose) = 600
		expect(res.balance?.granted_balance).toBe(600);
		expect(res.balance?.current_balance).toBe(600);

		// Breakdown should show both sources
		expect(res.balance?.breakdown).toBeDefined();
		expect(res.balance?.breakdown).toHaveLength(2);
	});

	test("v2: customer-level check should see merged balances", async () => {
		const res = (await autumnV2.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			// No entity_id
		})) as unknown as CheckResponseV2;

		expect(res.allowed).toBe(true);
		// Customer should see merged: 100 (product) + 500 (entity loose) = 600
		expect(res.balance?.granted_balance).toBe(600);
		expect(res.balance?.current_balance).toBe(600);
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

		// Find the product entitlement (has plan_id)
		const productEnt = breakdown?.find((b) => b.plan_id === freeProd.id);
		expect(productEnt).toBeDefined();
		expect(productEnt?.granted_balance).toBe(100);

		// Find the loose entitlement (plan_id is null)
		const looseEnt = breakdown?.find((b) => b.plan_id === null);
		expect(looseEnt).toBeDefined();
		expect(looseEnt?.granted_balance).toBe(500);
	});
});
