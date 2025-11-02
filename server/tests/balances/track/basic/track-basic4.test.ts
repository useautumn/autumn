import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { TestFeature } from "tests/setup/v2Features.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const action1Feature = constructFeatureItem({
	featureId: TestFeature.Action1,
	includedUsage: 200,
});

const action3Feature = constructFeatureItem({
	featureId: TestFeature.Action3,
	includedUsage: 150,
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [action1Feature, action3Feature],
});

const testCase = "track-basic4";

describe(`${chalk.yellowBright("track-basic4: track with event_name deducts from multiple features")}`, () => {
	const customerId = "track-basic4";
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

		await autumnV1.attach({
			customer_id: customerId,
			product_id: freeProd.id,
		});
	});

	test("should have initial balances", async () => {
		const customer = await autumnV1.customers.get(customerId);

		expect(customer.features[TestFeature.Action1].balance).toBe(200);
		expect(customer.features[TestFeature.Action3].balance).toBe(150);
	});

	test("should deduct from both action1 and action3 using event_name", async () => {
		const deductValue = 45.67;

		await autumnV1.track({
			customer_id: customerId,
			event_name: "action-event",
			value: deductValue,
		});

		const customer = await autumnV1.customers.get(customerId);

		const action1Balance = customer.features[TestFeature.Action1].balance;
		const action1Usage = customer.features[TestFeature.Action1].usage;
		const action3Balance = customer.features[TestFeature.Action3].balance;
		const action3Usage = customer.features[TestFeature.Action3].usage;

		const expectedAction1Balance = new Decimal(200).sub(deductValue).toNumber();
		const expectedAction3Balance = new Decimal(150).sub(deductValue).toNumber();

		expect(action1Balance).toBe(expectedAction1Balance);
		expect(action1Usage).toBe(deductValue);
		expect(action3Balance).toBe(expectedAction3Balance);
		expect(action3Usage).toBe(deductValue);
	});
});
