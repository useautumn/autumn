import { type AppEnv, LegacyVersion, type Organization } from "@autumn/shared";
import type { Customer } from "autumn-js";
import { expect } from "chai";
import chalk from "chalk";
import type Stripe from "stripe";
import { addPrefixToProducts } from "tests/attach/utils.js";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { createProducts } from "tests/utils/productUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

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
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		const { testClockId: testClockId1 } = await initCustomer({
			autumn: autumnJs,
			customerId,
			db,
			org,
			env,
			attachPm: "success",
		});

		addPrefixToProducts({
			products: [pro],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [pro],
			db,
			orgId: org.id,
			env,
		});

		testClockId = testClockId1!;
	});

	it("should attach pro product", async () => {
		await attachAndExpectCorrect({
			autumn,
			customerId,
			product: pro,
			stripeCli,
			db,
			org,
			env,
		});

		const customer = await autumn.customers.get(customerId);
		const wordsFeature = customer.features[TestFeature.Words];
		// @ts-expect-error
		expect(wordsFeature.interval_count).to.equal(null);
		expect(wordsFeature.breakdown?.length).to.equal(2);

		expect(
			wordsFeature.breakdown?.some(
				(b: any) => b.interval_count === 1 && b.interval === "month",
			),
		).to.equal(true);
		expect(
			wordsFeature.breakdown?.some(
				(b: any) => b.interval_count === 2 && b.interval === "month",
			),
		).to.equal(true);
	});

	const trackVal = 300;
	it("should have correct breakdown after usage", async () => {
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

		expect(monthlyBreakdown?.balance).to.equal(includedUsage - trackVal);
		expect(biMonthlyBreakdown?.balance).to.equal(includedUsage);

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

		expect(monthlyBreakdown2?.balance).to.equal(0);
		expect(biMonthlyBreakdown2?.balance).to.equal(includedUsage - 100);
	});
});
