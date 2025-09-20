import {
  type AppEnv,
  CusExpand,
  CusProductStatus,
  ErrCode,
  type Organization,
  type ReferralCode,
  type RewardRedemption,
} from "@autumn/shared";
import { assert } from "chai";
import chalk from "chalk";
import type { Stripe } from "stripe";
import { setupBefore } from "tests/before.js";
import { expectProductV1Attached } from "tests/utils/expectUtils/expectProductAttached.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import AutumnError, { AutumnInt } from "@/external/autumn/autumnCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { RewardRedemptionService } from "@/internal/rewards/RewardRedemptionService.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { products, referralPrograms } from "../../../global.js";

export const group = "referrals14";

describe(`${chalk.yellowBright(
  "referrals14: Testing referrals - referrer on Premium (higher tier), gets pro_amount discount - coupon-based"
)}`, () => {
  const mainCustomerId = "main-referral-14";
  const redeemer = "referral14-r1";
  const redeemerPM = "success";
  const autumn: AutumnInt = new AutumnInt();
  let stripeCli: Stripe;
  const testClockIds: string[] = [];
  let referralCode: ReferralCode;

  let redemption: RewardRedemption;
  let db: DrizzleCli;
  let org: Organization;
  let env: AppEnv;

  before(async function () {
    await setupBefore(this);
    stripeCli = this.stripeCli;
    db = this.db;
    org = this.org;
    env = this.env;

    try {
      await Promise.all([
        autumn.customers.delete(mainCustomerId, { deleteInStripe: true }),
        autumn.customers.delete(redeemer, { deleteInStripe: true }),
        RewardRedemptionService._resetCustomerRedemptions({
          db,
          internalCustomerId: [mainCustomerId, redeemer],
        }),
      ]);
    } catch {}

    // Initialize main customer with Premium product already attached
    const res = await initCustomer({
      autumn: this.autumnJs,
      customerId: mainCustomerId,
      db,
      org,
      env,
      attachPm: "success",
    });

    testClockIds.push(res.testClockId);

    // Attach Premium product to main customer first (higher tier than Pro)
    await autumn.attach({
      customer_id: mainCustomerId,
      product_id: products.premium.id,
    });

    const redeemerRes = await initCustomer({
      autumn: this.autumnJs,
      customerId: redeemer,
      db: this.db,
      org: this.org,
      env: this.env,
      attachPm: redeemerPM,
      withTestClock: true,
    });

    testClockIds.push(redeemerRes.testClockId);

    // Advance 10 days after Premium is attached, then redeem the code
    await Promise.all(
      testClockIds.map((x) =>
        advanceTestClock({
          testClockId: x,
          numberOfDays: 10,
          waitForSeconds: 5,
          stripeCli,
        })
      )
    );
  });

  it("should create code once", async () => {
    referralCode = await autumn.referrals.createCode({
      customerId: mainCustomerId,
      referralId: referralPrograms.paidProductImmediateReferrer.id,
    });

    assert.exists(referralCode.code);

    // Get referral code again
    const referralCode2 = await autumn.referrals.createCode({
      customerId: mainCustomerId,
      referralId: referralPrograms.paidProductImmediateReferrer.id,
    });

    assert.equal(referralCode2.code, referralCode.code);
  });

  it("should create redemption for redeemer and fail if redeemed again", async () => {
    redemption = await autumn.referrals.redeem({
      customerId: redeemer,
      code: referralCode.code,
    });

    // Try redeem for redeemer again
    try {
      await autumn.referrals.redeem({
        customerId: redeemer,
        code: referralCode.code,
      });
      assert.fail("Should not be able to redeem again");
    } catch (error) {
      assert.instanceOf(error, AutumnError);
      assert.equal(error.code, ErrCode.CustomerAlreadyRedeemedReferralCode);
    }
  });

  it("should have referrer already on Premium, and redeemer gets free product", async () => {
    const redemptionResult = await autumn.redemptions.get(redemption.id);
    assert.equal(redemptionResult.redeemer_applied, true);

    const mainCus = await autumn.customers.get(mainCustomerId);
    const redeemerCus = await autumn.customers.get(redeemer);
    const mainProds = mainCus.products;
    const redeemerProds = redeemerCus.products;

    // Main customer (referrer) should have the premium product (already attached)
    assert.equal(mainProds.length, 1);
    assert.equal(mainProds[0].id, products.premium.id);

    // Redeemer should only have the free product (no pro product given in referrer-only program)
    assert.equal(redeemerProds.length, 1);
    assert.equal(redeemerProds[0].id, products.free.id);

    expectProductV1Attached({
      customer: mainCus,
      product: products.premium,
      status: CusProductStatus.Active,
    });

    // Verify redeemer only has free product
    expectProductV1Attached({
      customer: redeemerCus,
      product: products.free,
      status: CusProductStatus.Active,
    });
  });

  it("should advance test clock and verify referrer gets pro_amount discount on Premium cycle", async () => {
    // Advance 21 more days (total 31 days from start) to trigger next billing cycle
    // Coupon was applied on day 10, lasts 30 days, so should still be active on day 31
    await Promise.all(
      testClockIds.map((x) =>
        advanceTestClock({
          testClockId: x,
          numberOfDays: 31,
          waitForSeconds: 25,
          stripeCli,
        })
      )
    );

    // Test that main customer's Premium invoice has pro_amount discount applied
    const mainCustomerWithInvoices = await autumn.customers.get(
      mainCustomerId,
      {
        expand: [CusExpand.Invoices],
      }
    );

    const premiumInvoice = mainCustomerWithInvoices.invoices.find((x) =>
      x.product_ids.includes(products.premium.id)
    );
    if (premiumInvoice) {
      // Premium costs $50, Pro costs $10 - so referrer should get $10 discount on Premium
      // Expected: Premium ($50) - Pro amount ($10) = $40
      console.log(products.premium.prices);
      const premiumPrice = products.premium.prices[0].config.amount; // $50
      const proAmount = products.pro.prices[0].config.amount; // $10 (pro_amount discount)
      const expectedTotal = premiumPrice - proAmount; // $40

      // The invoice total should be exactly Premium price minus pro_amount
      assert.equal(
        premiumInvoice.total,
        expectedTotal,
        `Premium invoice should be $40 (Premium $50 - Pro amount $10 discount). Got $${premiumInvoice.total}`
      );

      // Verify that the discount was applied (total is less than full Premium price)
      assert.isBelow(
        premiumInvoice.total,
        premiumPrice,
        "Referrer on Premium should get pro_amount discount, making it less than full Premium price"
      );
    }

    const dbCustomers = await Promise.all(
      [mainCustomerId, redeemer].map((x) =>
        CusService.getFull({
          db,
          idOrInternalId: x,
          orgId: org.id,
          env,
          inStatuses: [
            CusProductStatus.Active,
            CusProductStatus.PastDue,
            CusProductStatus.Expired,
          ],
        })
      )
    );

    const expectedProducts = [
      [
        // Main referrer - keeps Premium with pro_amount discount applied
        { name: "Free", status: CusProductStatus.Expired },
        { name: "Premium", status: CusProductStatus.Active },
      ],
      [
        // Redeemer - only has free product (no reward in referrer-only program)
        { name: "Free", status: CusProductStatus.Active },
      ],
    ];

    dbCustomers.forEach((customer, index) => {
      const expectedProductsForCustomer = expectedProducts[index];
      expectedProductsForCustomer.forEach((expectedProduct) => {
        const matchingProduct = customer.customer_products.find(
          (cp) =>
            cp.product.name === expectedProduct.name &&
            cp.status === expectedProduct.status
        );
        const unMatchedProduct = customer.customer_products.find(
          (cp) => cp.product.name === expectedProduct.name
        );

        assert.exists(
          matchingProduct,
          `Customer ${customer.name} should have ${expectedProduct.name} product with status ${expectedProduct.status}. ${unMatchedProduct ? `However ${unMatchedProduct.product.name} with status ${unMatchedProduct.status} was found instead` : ""}`
        );
      });
    });
  });
});
