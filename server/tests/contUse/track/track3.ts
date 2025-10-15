import {
	type AppEnv,
	LegacyVersion,
	OnDecrease,
	OnIncrease,
	type Organization,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { addWeeks } from "date-fns";
import type Stripe from "stripe";
import { addPrefixToProducts } from "tests/attach/utils.js";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import {
	expectSubQuantityCorrect,
	expectUpcomingItemsCorrect,
} from "tests/utils/expectUtils/expectContUseUtils.js";
import { createProducts } from "tests/utils/productUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";

const userItem = constructArrearProratedItem({
	featureId: TestFeature.Users,
	pricePerUnit: 50,
	includedUsage: 1,
	config: {
		on_increase: OnIncrease.ProrateNextCycle,
		on_decrease: OnDecrease.ProrateNextCycle,
	},
});

export const pro = constructProduct({
	items: [userItem],
	type: "pro",
});

const testCase = "track3";

describe(`${chalk.yellowBright(`contUse/${testCase}: Testing track usage for cont use, prorate next cycle`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
	let testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let stripeCli: Stripe;
	let curUnix = new Date().getTime();

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		stripeCli = this.stripeCli;

		addPrefixToProducts({
			products: [pro],
			prefix: testCase,
		});

		await createProducts({
			autumn,
			products: [pro],
			customerId,
			db,
			orgId: org.id,
			env,
		});

		const { testClockId: testClockId1 } = await initCustomer({
			autumn: autumnJs,
			customerId,
			db,
			org,
			env,
			attachPm: "success",
		});

		testClockId = testClockId1!;
	});

	let usage = 0;
	it("should attach pro", async () => {
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

	it("should create track +3 usage and have correct invoice", async () => {
		curUnix = await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addWeeks(new Date(), 2).getTime(),
			waitForSeconds: 5,
		});

		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 3,
		});

		await timeout(15000);

		usage += 3;

		const { stripeSubs, cusProduct, fullCus } = await expectSubQuantityCorrect({
			stripeCli,
			productId: pro.id,
			db,
			org,
			env,
			customerId,
			usage,
		});

		await expectUpcomingItemsCorrect({
			stripeCli,
			fullCus,
			stripeSubs,
			curUnix,
			expectedNumItems: 1,
			unitPrice: userItem.price!,
			quantity: 2,
		});

		const customer = await autumn.customers.get(customerId);
		const invoices = customer.invoices;
		expect(invoices.length).to.equal(1);
	});

	it("should track -1 and have no new invoice", async () => {
		curUnix = await advanceTestClock({
			stripeCli,
			testClockId,
			advanceTo: addWeeks(curUnix, 1).getTime(),
			waitForSeconds: 5,
		});

		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: -1,
		});

		usage -= 1;

		const { stripeSubs, cusProduct, fullCus } = await expectSubQuantityCorrect({
			stripeCli,
			productId: pro.id,
			db,
			org,
			env,
			customerId,
			usage,
		});

		await expectUpcomingItemsCorrect({
			stripeCli,
			fullCus,
			stripeSubs,
			unitPrice: userItem.price!,
			curUnix,
			expectedNumItems: 2,
			quantity: -1,
		});

		const customer = await autumn.customers.get(customerId);
		const invoices = customer.invoices;
		expect(invoices.length).to.equal(1);
	});

	it("should track -1 and have no new invoice", async () => {
		const quantity = 2;
		await autumn.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: quantity,
		});

		usage += quantity;

		const { stripeSubs, cusProduct, fullCus } = await expectSubQuantityCorrect({
			stripeCli,
			productId: pro.id,
			db,
			org,
			env,
			customerId,
			usage,
		});

		await expectUpcomingItemsCorrect({
			stripeCli,
			fullCus,
			stripeSubs,
			unitPrice: userItem.price!,
			curUnix,
			expectedNumItems: 3,
			quantity,
		});

		const customer = await autumn.customers.get(customerId);
		const invoices = customer.invoices;
		expect(invoices.length).to.equal(1);
	});
});
