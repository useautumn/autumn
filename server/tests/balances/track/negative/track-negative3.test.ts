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

const testCase = "track-negative3";

describe(`${chalk.yellowBright("track-negative3: track negative on free allocated feature, should cap with granted balance")}`, () => {
	const customerId = "track-negative3";
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

	test("should track positive into 'overage'", async () => {
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

	test("should track negative and cap at granted balance", async () => {
		// Currently at -3
		const trackValue = -20;

		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: trackValue,
		});

		expect(trackRes.balance).toMatchObject({
			granted_balance: 5,
			current_balance: 5,
			purchased_balance: 0,
			usage: 0,
		});
	});

	test("non-cached customer should reflect changes", async () => {
		await timeout(2000);
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId, {
			skip_cache: "true",
		});

		expect(customer.balances[TestFeature.Users]).toMatchObject({
			granted_balance: 5,
			current_balance: 5,
			purchased_balance: 0,
			usage: 0,
		});
	});

	test("should update balance and cap at granted balance", async () => {
		await autumnV2.balances.update({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			current_balance: 10,
			granted_balance: 10,
		});

		const customer = await autumnV2.customers.get<ApiCustomer>(customerId);
		const balance = customer.balances[TestFeature.Users];

		expect(balance).toMatchObject({
			granted_balance: 10,
			current_balance: 10,
			purchased_balance: 0,
			usage: 0,
		});

		await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 5,
		});
		const trackRes: TrackResponseV2 = await autumnV2.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: -100,
		});

		expect(trackRes.balance).toMatchObject({
			granted_balance: 10,
			current_balance: 10,
			purchased_balance: 0,
			usage: 0,
		});
	});
	return;

	test("non-cached customer should reflect changes", async () => {
		await timeout(2000);
		const customer = await autumnV2.customers.get<ApiCustomer>(customerId, {
			skip_cache: "true",
		});

		expect(customer.balances[TestFeature.Users]).toMatchObject({
			granted_balance: 10,
			current_balance: 10,
			purchased_balance: 0,
			usage: 0,
		});
	});
});
