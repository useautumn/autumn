import { createLogtailWithContext } from "@/external/logtail/logtailUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { getOriginalCouponId } from "@/internal/rewards/rewardUtils.js";
import { getPriceForOverage } from "@/internal/prices/priceUtils.js";
import { Customer } from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import { addHours, addMonths } from "date-fns";
import Stripe from "stripe";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { features, products, rewards } from "tests/global.js";
import { compareMainProduct } from "tests/utils/compare.js";
import { getFixedPriceAmount, timeout } from "tests/utils/genUtils.js";

import {
  advanceClockForInvoice,
  advanceTestClock,
  completeCheckoutForm,
  getDiscount,
} from "tests/utils/stripeUtils.js";
import { initCustomerWithTestClock } from "tests/utils/testInitUtils.js";

describe(
  chalk.yellow("coupon1 -- Testing one-off rollover, apply to all"),
  () => {
    let logger: any;
    let customerId = "coupon1";
    let stripeCli: Stripe;
    let customer: Customer;
    let testClockId: string;

    let couponAmount = rewards.rolloverAll.discount_config.discount_value;

    before(async function () {
      const { testClockId: testClockId1, customer: customer1 } =
        await initCustomerWithTestClock({
          customerId,
          org: this.org,
          env: this.env,
          sb: this.sb,
        });
      testClockId = testClockId1;
      customer = customer1;

      logger = createLogtailWithContext({
        test: "coupon1",
        customerId,
      });
      stripeCli = createStripeCli({
        org: this.org,
        env: this.env,
      });
    });

    // CYCLE 0
    it("CYCLE 0: should attach pro with overage (through checkout)", async () => {
      couponAmount -= getFixedPriceAmount(products.proWithOverage);

      const res = await AutumnCli.attach({
        customerId,
        productId: products.proWithOverage.id,
        forceCheckout: true,
      });

      await completeCheckoutForm(
        res.checkout_url,
        undefined,
        rewards.rolloverAll.id
      );

      await timeout(20000);

      const cusRes = await AutumnCli.getCustomer(customerId);
      compareMainProduct({
        sent: products.proWithOverage,
        cusRes,
      });
    });

    it("CYCLE 0: should have $0 invoice and correct remaining coupon amount", async () => {
      const cusRes = await AutumnCli.getCustomer(customerId);
      expect(cusRes.invoices[0].total).to.equal(0);

      const cusDiscount = await getDiscount({
        stripeCli: stripeCli,
        customer: cusRes.customer,
      });

      try {
        expect(getOriginalCouponId(cusDiscount.coupon?.id)).to.equal(
          rewards.rolloverAll.id
        );

        // Expect amount to be original amount - pro price
        expect(cusDiscount.coupon?.amount_off).to.equal(couponAmount * 100);
      } catch (error) {
        console.error("--------------------------------");
        console.error(
          "Expected stripe cus to have coupon",
          rewards.rolloverAll
        );
        console.error("Actual stripe cus discount", cusDiscount);
        throw error;
      }
    });

    // CYCLE 1
    it("CYCLE 1: should set usage to -100 and advance clock by 1 month", async () => {
      const usage = 100;
      const res = await AutumnCli.usage({
        customerId,
        featureId: features.metered1.id,
        value: usage,
      });

      // Price
      const price = getPriceForOverage(
        products.proWithOverage.prices[1],
        -(products.proWithOverage.entitlements.metered1.allowance! - usage)
      );

      couponAmount =
        couponAmount - (price + getFixedPriceAmount(products.proWithOverage));

      await advanceClockForInvoice({
        stripeCli,
        testClockId,
        waitForMeterUpdate: true,
      });
    });

    it("CYCLE 1: should have $0 invoice and correct new coupon amount", async () => {
      const cusRes = await AutumnCli.getCustomer(customerId);
      expect(cusRes.invoices[0].total).to.equal(0);

      const cusDiscount = await getDiscount({
        stripeCli: stripeCli,
        customer,
      });

      try {
        expect(getOriginalCouponId(cusDiscount.coupon?.id)).to.equal(
          rewards.rolloverAll.id
        );
        expect(cusDiscount.coupon?.amount_off).to.equal(couponAmount * 100);
      } catch (error) {
        console.log("--------------------------------");
        console.log("coupon1, cycle 1 failed");
        console.log("Expected stripe cus to have coupon", rewards.rolloverAll);
        console.log("Actual stripe cus discount", cusDiscount);
        throw error;
      }
    });

    // CYCLE 2
    it("CYCLE 2: should have $0 invoice and correct new coupon amount after 2nd cycle", async () => {
      await timeout(20000);
      let advanceTo = addHours(addMonths(new Date(), 2), 2);
      await advanceTestClock({
        stripeCli,
        testClockId,
        advanceTo: advanceTo.getTime(),
      });

      const cusDiscount = await getDiscount({
        stripeCli: stripeCli,
        customer,
      });

      const newCouponAmount =
        couponAmount - getFixedPriceAmount(products.proWithOverage);

      try {
        expect(cusDiscount.coupon?.amount_off).to.equal(newCouponAmount * 100);
      } catch (error) {
        console.log("--------------------------------");
        console.log("coupon1, cycle 2 failed");
        console.log("Expected coupon amount", newCouponAmount * 100);
        console.log("Stripe cus discount", cusDiscount);
        throw error;
      }
    });
  }
);
