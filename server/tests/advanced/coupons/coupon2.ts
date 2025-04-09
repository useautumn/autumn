import { createLogtailWithContext } from "@/external/logtail/logtailUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { getOriginalCouponId } from "@/internal/rewards/rewardUtils.js";
import { getPriceForOverage } from "@/internal/prices/priceUtils.js";
import { Customer } from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
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
  chalk.yellow("coupon2 -- Testing one-off rollover, apply to usage only"),
  () => {
    let logger: any;
    let customerId = "coupon2";
    let stripeCli: Stripe;
    let customer: Customer;
    let testClockId: string;

    let couponAmount = rewards.rolloverUsage.discount_value;

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
        test: "coupon2 -- Testing one-off rollover, apply to usage only",
        customerId,
      });
      stripeCli = createStripeCli({
        org: this.org,
        env: this.env,
      });
    });

    // CYCLE 0
    it("should attach pro with overage (through checkout)", async () => {
      const res = await AutumnCli.attach({
        customerId,
        productId: products.proWithOverage.id,
        forceCheckout: true,
      });

      await completeCheckoutForm(
        res.checkout_url,
        undefined,
        rewards.rolloverUsage.id
      );

      await timeout(10000);

      const cusRes = await AutumnCli.getCustomer(customerId);
      compareMainProduct({
        sent: products.proWithOverage,
        cusRes,
      });
    });

    it("should have fixed price invoice and correct remaining coupon amount", async () => {
      const cusRes = await AutumnCli.getCustomer(customerId);
      const fixedPrice = getFixedPriceAmount(products.proWithOverage);
      expect(cusRes.invoices[0].total).to.equal(fixedPrice);

      const cusDiscount = await getDiscount({
        stripeCli: stripeCli,
        customer: cusRes.customer,
      });

      try {
        expect(getOriginalCouponId(cusDiscount.coupon?.id)).to.equal(
          rewards.rolloverUsage.id
        );

        // Expect amount to be original amount - pro price
        expect(cusDiscount.coupon?.amount_off).to.equal(couponAmount * 100);
      } catch (error) {
        logger.error("--------------------------------");
        logger.error(
          "Expected stripe cus to have coupon",
          rewards.rolloverUsage
        );
        logger.error("Actual stripe cus discount", cusDiscount);
        throw error;
      }
    });

    // CYCLE 1
    it("should set usage to -100 and advance clock by 1 month", async () => {
      const usage = Math.min(Math.floor(Math.random() * 1000), 100);

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

      couponAmount = couponAmount - price;

      await advanceClockForInvoice({
        stripeCli,
        testClockId,
        waitForMeterUpdate: true,
      });
    });

    it("should have $0 invoice and correct new coupon amount", async () => {
      const cusRes = await AutumnCli.getCustomer(customerId);
      expect(cusRes.invoices[0].total).to.equal(
        getFixedPriceAmount(products.proWithOverage)
      );

      const cusDiscount = await getDiscount({
        stripeCli: stripeCli,
        customer: cusRes.customer,
      });

      try {
        expect(getOriginalCouponId(cusDiscount.coupon?.id)).to.equal(
          rewards.rolloverUsage.id
        );
        expect(cusDiscount.coupon?.amount_off).to.equal(couponAmount * 100);
      } catch (error) {
        logger.error("--------------------------------");
        logger.error("coupon2, cycle 1 failed");
        logger.error(
          "Expected stripe cus to have coupon",
          rewards.rolloverUsage
        );
        logger.error("Actual stripe cus discount", cusDiscount);
        throw error;
      }
    });
  }
);
