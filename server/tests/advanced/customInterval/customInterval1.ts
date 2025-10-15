import { type AppEnv, LegacyVersion, type Organization } from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import type Stripe from "stripe";
import { addPrefixToProducts } from "tests/attach/utils.js";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { createProducts } from "tests/utils/productUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { getBasePrice } from "tests/utils/testProductUtils/testProductUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

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
			products: [pro, premium],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [pro, premium],
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
	});

	const usage = 100012;
	it("should upgrade to premium product and have correct invoice next cycle", async () => {
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
			stripeCli,
			db,
			org,
			env,
		});

		const customer = await autumn.customers.get(customerId);
		expect(customer.invoices.length).to.equal(2);

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
		expect(invoices.length).to.equal(3);
		expect(invoices[0].product_ids).to.include(premium.id);
		expect(invoices[0].total).to.equal(getBasePrice({ product: premium }));

		const wordsFeature = customer2.features[TestFeature.Words];
		// @ts-expect-error
		expect(wordsFeature.interval_count).to.equal(2);
	});
});
