import chalk from "chalk";
import Stripe from "stripe";
import { APIVersion, AppEnv, Customer, Organization } from "@autumn/shared";
import { getOriginalCouponId } from "@/internal/rewards/rewardUtils.js";
import { expect } from "chai";
import { addHours, addMonths } from "date-fns";
import { rewards } from "tests/global.js";
import { timeout } from "tests/utils/genUtils.js";

import {
  advanceTestClock,
  completeCheckoutForm,
  getDiscount,
} from "tests/utils/stripeUtils.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { setupBefore } from "tests/before.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructArrearItem } from "@/utils/scriptUtils/constructItem.js";
import { TestFeature } from "tests/setup/v2Features.js";
import {
  addPrefixToProducts,
  getBasePrice,
} from "tests/utils/testProductUtils/testProductUtils.js";
import { createProducts } from "tests/utils/productUtils.js";
import { attachAndExpectCorrect } from "tests/utils/expectUtils/expectAttach.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { expectProductAttached } from "tests/utils/expectUtils/expectProductAttached.js";
import { getExpectedInvoiceTotal } from "tests/utils/expectUtils/expectInvoiceUtils.js";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";

const testCase = "coupon1";

const pro = constructProduct({
  type: "pro",
  items: [constructArrearItem({ featureId: TestFeature.Words })],
});

const simulateOneCycle = async ({
  customerId,
  db,
  org,
  env,
  stripeCli,
  autumn,
  testClockId,
  couponAmount,
  curUnix,
}: {
  customerId: string;
  db: DrizzleCli;
  org: Organization;
  env: AppEnv;
  stripeCli: Stripe;
  autumn: AutumnInt;
  testClockId: string;
  couponAmount: number;
  curUnix: number;
}) => {
  const usage = Math.random() * 100000 + 10000;
  await autumn.track({
    customer_id: customerId,
    feature_id: TestFeature.Words,
    value: usage,
  });

  // Expected invoice total
  let expectedTotal = await getExpectedInvoiceTotal({
    usage: [{ featureId: TestFeature.Words, value: usage }],
    customerId,
    productId: pro.id,
    db,
    org,
    env,
    stripeCli,
  });

  couponAmount -= expectedTotal;

  curUnix = await advanceTestClock({
    stripeCli,
    testClockId,
    advanceTo: addHours(
      addMonths(curUnix, 1),
      hoursToFinalizeInvoice
    ).getTime(),
    waitForSeconds: 30,
  });

  const customer = await autumn.customers.get(customerId);
  expect(customer.invoices![0].total).to.equal(0);

  const cusDiscount = await getDiscount({
    stripeCli: stripeCli,
    stripeId: customer.stripe_id!,
  });

  expect(cusDiscount).to.exist;

  expect(getOriginalCouponId(cusDiscount.coupon?.id)).to.equal(
    rewards.rolloverAll.id
  );

  expect(cusDiscount.coupon?.amount_off).to.equal(
    Math.round(couponAmount * 100),
    `Expected stripe cus to have coupon amount ${couponAmount * 100}`
  );

  return {
    couponAmount,
    curUnix,
  };
};

describe(
  chalk.yellow(
    `${testCase} - Testing invoice credits reward, apply to all product`
  ),
  () => {
    let customerId = "coupon1";
    let stripeCli: Stripe;
    let customer: Customer;
    let testClockId: string;
    let db: DrizzleCli;
    let org: Organization;
    let env: AppEnv;

    let autumn: AutumnInt = new AutumnInt({ version: APIVersion.v1_4 });

    let couponAmount = rewards.rolloverAll.discount_config.discount_value;
    let curUnix = new Date().getTime();

    before(async function () {
      await setupBefore(this);
      db = this.db;
      org = this.org;
      env = this.env;
      stripeCli = this.stripeCli;

      const res = await initCustomer({
        customerId,
        org,
        env,
        db,
        autumn: this.autumnJs,
      });

      addPrefixToProducts({
        products: [pro],
        prefix: testCase,
      });

      await createProducts({
        products: [pro],
        orgId: org.id,
        env,
        db,
        autumn,
      });

      testClockId = res.testClockId;
      customer = res.customer;
    });

    // CYCLE 0
    it("should attach pro", async () => {
      const res = await autumn.attach({
        customer_id: customerId,
        product_id: pro.id,
      });

      await completeCheckoutForm(
        res.checkout_url,
        undefined,
        rewards.rolloverAll.id
      );

      await timeout(10000);

      couponAmount -= getBasePrice({ product: pro });

      const customer = await autumn.customers.get(customerId);
      expectProductAttached({ customer, product: pro });

      expect(customer.invoices![0].total).to.equal(0);

      const cusDiscount = await getDiscount({
        stripeCli,
        stripeId: customer.stripe_id!,
      });

      expect(cusDiscount).to.exist;
      expect(getOriginalCouponId(cusDiscount.coupon?.id)).to.equal(
        rewards.rolloverAll.id
      );
      expect(cusDiscount.coupon?.amount_off).to.equal(couponAmount * 100);
    });

    it("should run one cycle and have correct invoice + coupon amount", async () => {
      const res = await simulateOneCycle({
        customerId,
        db,
        org,
        env,
        stripeCli,
        autumn,
        testClockId,
        couponAmount,
        curUnix: new Date().getTime(),
      });

      couponAmount = res.couponAmount;
      curUnix = res.curUnix;
    });

    // CYCLE 1
    it("should run another cycle and have correct invoice + coupon amount", async () => {
      const res = await simulateOneCycle({
        customerId,
        db,
        org,
        env,
        stripeCli,
        autumn,
        testClockId,
        couponAmount,
        curUnix,
      });
    });
  }
);
