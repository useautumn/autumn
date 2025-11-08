import { beforeAll, describe, expect, test } from "bun:test";
import {
	type Customer,
	LegacyVersion,
	type LimitedItem,
	RolloverDuration,
} from "@autumn/shared";
import chalk from "chalk";
import type Stripe from "stripe";
import { TestFeature } from "tests/setup/v2Features.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { timeout } from "../../utils/genUtils.js";
import { resetAndGetCusEnt } from "./rolloverTestUtils.js";

const freeRollover = { max: 1000, length: 1, duration: RolloverDuration.Month };
const proRollover = { max: 600, length: 1, duration: RolloverDuration.Month };

const freeMsges = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 500,
	rolloverConfig: freeRollover,
}) as LimitedItem;

const proMsges = constructFeatureItem({
	featureId: TestFeature.Messages,
	includedUsage: 500,
	rolloverConfig: proRollover,
}) as LimitedItem;

const free = constructProduct({
	items: [freeMsges],
	type: "free",
	isDefault: false,
});

const pro = constructProduct({
	items: [proMsges],
	type: "pro",
});

const testCase = "rollover5";

describe(`${chalk.yellowBright(`${testCase}: Testing rollovers for upgrade`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let customer: Customer;
	let stripeCli: Stripe;
	const curUnix = new Date().getTime();

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;

		await initProductsV0({
			ctx,
			products: [free, pro],
			prefix: testCase,
			customerId,
		});

		const res = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		testClockId = res.testClockId!;
		customer = res.customer;
	});

	test("should attach free product", async () => {
		await autumn.attach({
			customer_id: customerId,
			product_id: free.id,
		});
	});

	test("should create rollovers", async () => {
		await resetAndGetCusEnt({
			customer,
			db: ctx.db,
			productGroup: testCase,
			featureId: TestFeature.Messages,
		});
		await resetAndGetCusEnt({
			customer,
			db: ctx.db,
			productGroup: testCase,
			featureId: TestFeature.Messages,
		});

		// Attach pro
		await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		const cus = await autumn.customers.get(customerId);
		const msgesFeature = cus.features[TestFeature.Messages];
		const freeRolloverBalance = freeMsges.included_usage * 2;
		const proRolloverBalance = Math.min(proRollover.max, freeRolloverBalance);

		expect(msgesFeature).toBeDefined();
		expect(msgesFeature?.balance).toBe(
			proMsges.included_usage + proRolloverBalance,
		);
		const rollovers = msgesFeature?.rollovers;
		// @ts-expect-error (rollovers is an array of rollovers)
		expect(rollovers?.[0].balance).toBe(100);
		// @ts-expect-error (rollovers is an array of rollovers)
		expect(rollovers[1].balance).toBe(500);

		// Verify non-cached customer balance
		await timeout(2000);
		const nonCachedCustomer = await autumn.customers.get(customerId, {
			skip_cache: "true",
		});
		const nonCachedMsgesFeature =
			nonCachedCustomer.features[TestFeature.Messages];
		expect(nonCachedMsgesFeature?.balance).toBe(
			proMsges.included_usage + proRolloverBalance,
		);

		const nonCachedRollovers = nonCachedMsgesFeature?.rollovers;
		// @ts-expect-error (rollovers is an array of rollovers)
		expect(nonCachedRollovers[0].balance).toBe(100);
		// @ts-expect-error (rollovers is an array of rollovers)
		expect(nonCachedRollovers[1].balance).toBe(500);
	});
});
