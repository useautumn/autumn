import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type TrackResponseV2 } from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "@tests/setup/v2Features.js";
import { timeout } from "@tests/utils/genUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { getV2Balance } from "../../testBalanceUtils.js";

const messagesFeature = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [messagesFeature],
});

const testCase = "track-basic2";

describe(`${chalk.yellowBright("track-basic2: track with value provided")}`, () => {
	const customerId = "track-basic2";
	const autumnV1: AutumnInt = new AutumnInt({ version: ApiVersion.V1_2 });
	const autumnV2: AutumnInt = new AutumnInt({ version: ApiVersion.V2_0 });

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

	test("should have initial balance of 100", async () => {
		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;

		expect(balance).toBe(100);
	});

	test("should deduct exact value provided", async () => {
		const deductValue = 23.47;

		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: deductValue,
		});

		expect(trackRes.balance).toBeDefined();
		expect(trackRes.balance?.current_balance).toBe(100 - deductValue);
		expect(trackRes.balance?.usage).toBe(deductValue);

		// V1 Check
		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Messages].balance;
		const usage = customer.features[TestFeature.Messages].usage;

		expect(balance).toBe(100 - deductValue);
		expect(usage).toBe(deductValue);

		// V2 Check
		const balanceV2 = await getV2Balance({
			customerId,
			featureId: TestFeature.Messages,
		});

		expect(balanceV2).toMatchObject({
			granted_balance: 100,
			current_balance: 100 - deductValue,
			usage: deductValue,
		});
	});

	test("should reflect deduction in non-cached customer after 2s", async () => {
		const deductValue = 23.47;

		// Wait 2 seconds for DB sync
		await timeout(2000);

		// Fetch customer with skip_cache=true
		const customer = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});
		const balance = customer.features[TestFeature.Messages].balance;
		const usage = customer.features[TestFeature.Messages].usage;

		expect(balance).toBe(100 - deductValue);
		expect(usage).toBe(deductValue);
	});
});
