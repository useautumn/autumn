import { type AppEnv, type Organization, RewardType } from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { createProducts, createReward } from "tests/utils/productUtils.js";
import { completeCheckoutForm } from "tests/utils/stripeUtils.js";
import { getBasePrice } from "tests/utils/testProductUtils/testProductUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { timeout } from "@/utils/genUtils.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import {
	constructCoupon,
	constructProduct,
} from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { addPrefixToProducts } from "../utils.js";

export const pro = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Messages,
			includedUsage: 100,
		}),
	],
	type: "pro",
});

const reward = constructCoupon({
	id: "checkout4",
	promoCode: "checkout4_code",
	discountType: RewardType.PercentageDiscount,
	discountValue: 50,
});

const testCase = "checkout4";
describe(`${chalk.yellowBright(`${testCase}: Testing attach coupon`)}`, () => {
	const customerId = testCase;
	const autumn: AutumnInt = new AutumnInt();
	let _testClockId: string;
	let db: DrizzleCli, org: Organization, env: AppEnv;
	let _stripeCli: Stripe;
	const _curUnix = Date.now();

	before(async function () {
		await setupBefore(this);
		const { autumnJs } = this;
		db = this.db;
		org = this.org;
		env = this.env;

		_stripeCli = this.stripeCli;

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
			// attachPm: "success",
		});

		await createReward({
			orgId: org.id,
			env,
			db,
			autumn,
			reward,
			productId: pro.id,
		});

		_testClockId = testClockId1!;
	});

	it("should attach pro and one off product", async () => {
		const res = await autumn.attach({
			customer_id: customerId,
			product_id: pro.id,
			reward: reward.id,
		});

		await completeCheckoutForm(res.checkout_url);
		await timeout(10000);

		const customer = await autumn.customers.get(customerId);

		expectProductAttached({
			customer,
			product: pro,
		});

		expect(customer.invoices.length).to.equal(1);
		const totalPrice = getBasePrice({ product: pro });
		expect(customer.invoices[0].total).to.equal(totalPrice * 0.5);
	});
});
