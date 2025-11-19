import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomer,
	ApiVersion,
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
import { timeout } from "../../../utils/genUtils";

const messagesFeature = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 100,
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [messagesFeature],
});

const testCase = "track-negative1";

describe(`${chalk.yellowBright("track-negative1: track negative on meterd feature")}`, () => {
	const customerId = "track-negative1";
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

	test("should deduct from messages with negative value", async () => {
		const deductValue = -37.89;

		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: deductValue,
		});

		expect(trackRes.balance).toMatchObject({
			granted_balance: 100,
			current_balance: 100,
			purchased_balance: 0,
			usage: 0,
		});
	});

	test("should deduct first, then deduct negative value and have correct balance", async () => {
		const deductValue1 = 50;
		const deductValue2 = -37.89;

		await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: deductValue1,
		});
		const trackRes2: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: deductValue2,
		});

		expect(trackRes2.balance).toMatchObject({
			granted_balance: 100,
			current_balance: 100 - deductValue1 - deductValue2,
			purchased_balance: 0,
			usage: deductValue1 + deductValue2,
		});

		await timeout(2000);
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId, {
			skip_cache: "true",
		});
		const balance = customer.balances[TestFeature.Messages];
		expect(balance).toMatchObject({
			granted_balance: 100,
			current_balance: 100 - deductValue1 - deductValue2,
			purchased_balance: 0,
			usage: deductValue1 + deductValue2,
		});
	});
});
