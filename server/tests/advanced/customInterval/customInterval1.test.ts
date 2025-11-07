import { LegacyVersion } from "@autumn/shared";
import { beforeAll, describe, expect, test } from "bun:test";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import type Stripe from "stripe";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { getBasePrice } from "tests/utils/testProductUtils/testProductUtils.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";

const testCase = "customInterval1";

export const pro = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
			intervalCount: 2,
			includedUsage: 500,
		}),
	],
	intervalCount: 2,
	type: "pro",
});

export const premium = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
			intervalCount: 2,
		}),
		// constructArrearItem({ featureId: TestFeature.Words }),
		// constructArrearProratedItem({
		//   featureId: TestFeature.Users,
		//   pricePerUnit: 30,
		// }),
	],
	intervalCount: 2,
	type: "premium",
});

describe(`${chalk.yellowBright(`${testCase}: Testing custom interval and interval count`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let stripeCli: Stripe;

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;

		const { testClockId: testClockId1 } = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
		});

		await initProductsV0({
			ctx,
			products: [pro, premium],
			prefix: testCase,
			customerId,
		});

		testClockId = testClockId1!;
	});

	test("should attach pro product", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
		});
	});

	const usage = 100012;
	test("should upgrade to premium product and have correct invoice next cycle", async () => {
		const curUnix = await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addMonths(new Date(), 1).getTime(),
			waitForSeconds: 15,
		});

		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: premium,
			stripeCli: ctx.stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
		});

		const customer = await autumn.customers.get(customerId);
		expect(customer.invoices.length).toBe(2);

		const nextUnix = await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addHours(
				addMonths(new Date(curUnix), 1),
				hoursToFinalizeInvoice,
			).getTime(),
			waitForSeconds: 30,
		});

		const customer2 = await autumn.customers.get(customerId);
		const invoices = customer2.invoices;
		expect(invoices.length).toBe(3);
		expect(invoices[0].product_ids).toContain(premium.id);
		expect(invoices[0].total).toBe(getBasePrice({ product: premium }));

		const wordsFeature = customer2.features[TestFeature.Words];
		// @ts-expect-error
		expect(wordsFeature.interval_count).toBe(2);
	});
});
