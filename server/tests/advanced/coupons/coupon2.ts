import {
	type AppEnv,
	CouponDurationType,
	type CreateReward,
	LegacyVersion,
	type Organization,
	RewardType,
} from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
import { getExpectedInvoiceTotal } from "tests/utils/expectUtils/expectInvoiceUtils.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { timeout } from "tests/utils/genUtils.js";
import { createProducts, createReward } from "tests/utils/productUtils.js";
import { completeCheckoutForm, getDiscount } from "tests/utils/stripeUtils.js";
import {
	addPrefixToProducts,
	getBasePrice,
} from "tests/utils/testProductUtils/testProductUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { getOriginalCouponId } from "@/internal/rewards/rewardUtils.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { advanceTestClock } from "@/utils/scriptUtils/testClockUtils.js";

const pro = constructProduct({
	type: "pro",
	items: [constructArrearItem({ featureId: TestFeature.Words })],
});

const testCase = "coupon2";

// Create reward input
const reward: CreateReward = {
	id: "usage",
	name: "usage",
	promo_codes: [{ code: "usage" }],
	type: RewardType.InvoiceCredits,
	discount_config: {
		discount_value: 10000,
		duration_type: CouponDurationType.Forever,
		duration_value: 1,
		should_rollover: true,
		apply_to_all: false,
		price_ids: [],
	},
};

describe(
	chalk.yellow(`${testCase} - Testing one-off rollover, apply to usage only`),
	() => {
		let logger: any;
		const customerId = testCase;
		let stripeCli: Stripe;
		let testClockId: string;

		const autumn: AutumnInt = new AutumnInt({ version: LegacyVersion.v1_4 });
		let org: Organization;
		let env: AppEnv;
		let db: DrizzleCli;

		let couponAmount = reward.discount_config!.discount_value;

		before(async function () {
			await setupBefore(this);

			org = this.org;
			env = this.env;
			db = this.db;
			stripeCli = this.stripeCli;

			const { testClockId: testClockId1 } = await initCustomer({
				customerId,
				org: this.org,
				env: this.env,
				db: this.db,
				autumn: this.autumnJs,
			});

			testClockId = testClockId1;

			addPrefixToProducts({
				products: [pro],
				prefix: testCase,
			});

			await createProducts({
				orgId: this.org.id,
				env: this.env,
				db: this.db,
				autumn,
				products: [pro],
			});

			await createReward({
				orgId: org.id,
				env,
				db,
				autumn,
				reward,
				productId: pro.id,
				onlyUsage: true,
			});
		});

		// CYCLE 0
		it("should attach pro with promo code", async () => {
			const res = await autumn.attach({
				customer_id: customerId,
				product_id: pro.id,
			});

			await completeCheckoutForm(res.checkout_url, undefined, reward.id);

			await timeout(10000);

			const customer = await autumn.customers.get(customerId);
			expectProductAttached({
				customer,
				product: pro,
			});
		});

		it("should have fixed price invoice and correct remaining coupon amount", async () => {
			const customer = await autumn.customers.get(customerId);
			const fixedPrice = getBasePrice({ product: pro });
			expect(customer.invoices![0].total).to.equal(fixedPrice);

			const cusDiscount = await getDiscount({
				stripeCli,
				stripeId: customer.stripe_id!,
			});

			expect(getOriginalCouponId(cusDiscount.coupon?.id)).to.equal(reward.id);
			expect(cusDiscount.coupon?.amount_off).to.equal(couponAmount * 100);
		});

		// CYCLE 1
		it("should track usage and have correct invoice amount", async () => {
			const usage = new Decimal(Math.random() * 1250120 + 10000)
				.toDecimalPlaces(2)
				.toNumber();

			await autumn.track({
				customer_id: customerId,
				feature_id: TestFeature.Words,
				value: usage,
			});

			const usageTotal = await getExpectedInvoiceTotal({
				org,
				env,
				db,
				customerId,
				productId: pro.id,
				usage: [{ featureId: TestFeature.Words, value: usage }],
				stripeCli,
				onlyIncludeUsage: true,
			});

			const basePrice = getBasePrice({ product: pro });

			couponAmount = couponAmount - usageTotal;

			await advanceTestClock({
				stripeCli,
				testClockId,
				advanceTo: addHours(
					addMonths(new Date(), 1),
					hoursToFinalizeInvoice,
				).getTime(),
				waitForSeconds: 20,
			});

			const customer = await autumn.customers.get(customerId);
			expect(customer.invoices![0].total).to.equal(basePrice);

			const cusDiscount = await getDiscount({
				stripeCli,
				stripeId: customer.stripe_id!,
			});

			expect(getOriginalCouponId(cusDiscount.coupon?.id)).to.equal(reward.id);

			expect(cusDiscount.coupon?.amount_off).to.equal(
				Math.round(couponAmount * 100),
			);
		});
	},
);
