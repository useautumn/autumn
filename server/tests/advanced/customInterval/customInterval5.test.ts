import { beforeAll, describe, expect, test } from "bun:test";
import { LegacyVersion } from "@autumn/shared";
import type { Customer } from "autumn-js";
import chalk from "chalk";
import type Stripe from "stripe";
import { TestFeature } from "@tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "@tests/utils/expectUtils/expectAttach.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";

const testCase = "customInterval5";

const includedUsage = 500;
const monthlyWords = constructFeatureItem({
	featureId: TestFeature.Words,
	includedUsage,
});

const biMonthlyWords = constructFeatureItem({
	featureId: TestFeature.Words,
	intervalCount: 2,
	includedUsage,
});

export const pro = constructProduct({
	items: [monthlyWords, biMonthlyWords],
	intervalCount: 2,
	type: "pro",
});

const getBreakdown = ({
	customer,
	intervalCount,
}: {
	customer: Customer;
	intervalCount: number;
}) => {
	const wordsFeature = customer.features[TestFeature.Words];
	return wordsFeature.breakdown?.find(
		(b: any) => b.interval_count === intervalCount,
	);
};

describe(`${chalk.yellowBright(`${testCase}: Testing multi interval features with custom intervals`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let stripeCli: Stripe;

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;

		await initProductsV0({
			ctx,
			products: [pro],
			prefix: testCase,
			customerId,
		});

		const { testClockId: testClockId1 } = await initCustomerV3({
			ctx,
			customerId,
			customerData: {},
			attachPm: "success",
			withTestClock: true,
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

		const customer = await autumn.customers.get(customerId);
		const wordsFeature = customer.features[TestFeature.Words];
		// @ts-expect-error
		expect(wordsFeature.interval_count).toBe(null);
		expect(wordsFeature.breakdown?.length).toBe(2);

		expect(
			wordsFeature.breakdown?.some(
				(b: any) => b.interval_count === 1 && b.interval === "month",
			),
		).toBe(true);
		expect(
			wordsFeature.breakdown?.some(
				(b: any) => b.interval_count === 2 && b.interval === "month",
			),
		).toBe(true);
	});

	const trackVal = 300;
	test("should have correct breakdown after usage", async () => {
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: trackVal,
		});

		await timeout(3000);

		const customer = await autumn.customers.get(customerId);

		// Should deduct
		const monthlyBreakdown = getBreakdown({ customer, intervalCount: 1 });
		const biMonthlyBreakdown = getBreakdown({ customer, intervalCount: 2 });

		expect(monthlyBreakdown?.balance).toBe(includedUsage - trackVal);
		expect(biMonthlyBreakdown?.balance).toBe(includedUsage);

		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Words,
			value: trackVal,
		});

		await timeout(3000);

		const customer2 = await autumn.customers.get(customerId);
		const monthlyBreakdown2 = getBreakdown({
			customer: customer2,
			intervalCount: 1,
		});
		const biMonthlyBreakdown2 = getBreakdown({
			customer: customer2,
			intervalCount: 2,
		});

		expect(monthlyBreakdown2?.balance).toBe(0);
		expect(biMonthlyBreakdown2?.balance).toBe(includedUsage - 100);
	});
});
