import { beforeAll, describe, expect, test } from "bun:test";
import { ApiVersion, type TrackResponseV2 } from "@autumn/shared";
import chalk from "chalk";
import { TestFeature } from "tests/setup/v2Features.js";
import { timeout } from "tests/utils/genUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const action1Feature = constructFeatureItem({
	featureId: TestFeature.Action1,
	includedUsage: 150,
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [action1Feature],
});

const testCase = "track-basic3";

describe(`${chalk.yellowBright("track-basic3: track with event_name instead of feature_id")}`, () => {
	const customerId = "track-basic3";
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

	test("should have initial balance of 150", async () => {
		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Action1].balance;

		expect(balance).toBe(150);
	});

	test("should deduct from action1 using event_name", async () => {
		const deductValue = 37.89;

		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			event_name: "action-event",
			value: deductValue,
		});

		expect(trackRes.balance).toBeDefined();
		expect(trackRes.balance?.feature_id).toBe(TestFeature.Action1);
		expect(trackRes.balance?.current_balance).toBe(150 - deductValue);
		expect(trackRes.balance?.usage).toBe(deductValue);

		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Action1].balance;
		const usage = customer.features[TestFeature.Action1].usage;

		expect(balance).toBe(150 - deductValue);
		expect(usage).toBe(deductValue);
	});

	test("should reflect deduction in non-cached customer after 2s", async () => {
		const deductValue = 37.89;

		// Wait 2 seconds for DB sync
		await timeout(2000);

		// Fetch customer with skip_cache=true
		const customer = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});
		const balance = customer.features[TestFeature.Action1].balance;
		const usage = customer.features[TestFeature.Action1].usage;

		expect(balance).toBe(150 - deductValue);
		expect(usage).toBe(deductValue);
	});
});
