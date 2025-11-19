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

const userItem = constructFeatureItem({
	featureId: TestFeature.Users,
	includedUsage: 5,
});

const freeProd = constructProduct({
	type: "free",
	isDefault: false,
	items: [userItem],
});

const testCase = "track-negative2";

describe(`${chalk.yellowBright("track-negative2: track negative on free allocated feature")}`, () => {
	const customerId = "track-negative2";
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

	test("should have initial balance of 5", async () => {
		const customer = await autumnV1.customers.get(customerId);
		const balance = customer.features[TestFeature.Users].balance;

		expect(balance).toBe(5);
	});

	test("should track positive into 'overage' ", async () => {
		const trackValue = 8;

		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: trackValue,
		});

		expect(trackRes.balance).toBeDefined();
		expect(trackRes.balance).toMatchObject({
			current_balance: 0,
			purchased_balance: 3,
			usage: trackValue,
		});
	});

	test("should track negative and reduce purchased balance first", async () => {
		const trackValue = -2;

		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: trackValue,
		});

		expect(trackRes.balance).toMatchObject({
			current_balance: 0,
			purchased_balance: 1,
			usage: 6,
		});
	});

	test("should track negative and reduce granted balance second", async () => {
		const trackValue = -2;

		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: trackValue,
		});

		expect(trackRes.balance).toMatchObject({
			current_balance: 1,
			purchased_balance: 0,
			usage: 4,
		});
	});

	test("non-cached customer should reflect changes", async () => {
		await timeout(2000);
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId, {
			skip_cache: "true",
		});

		expect(customer.balances[TestFeature.Users]).toMatchObject({
			current_balance: 1,
			purchased_balance: 0,
			usage: 4,
		});
	});
});
