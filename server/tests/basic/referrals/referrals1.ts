import { products, referralPrograms } from "../../global.js";
import { assert } from "chai";
import chalk from "chalk";
import AutumnError, { Autumn } from "@/external/autumn/autumnCli.js";
import { setupBefore } from "tests/before.js";
import {
  Customer,
  ErrCode,
  ReferralCode,
  RewardRedemption,
} from "@autumn/shared";
import { timeout } from "tests/utils/genUtils.js";
import { initCustomerWithTestClock } from "tests/utils/testInitUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { addDays, addHours, addMonths } from "date-fns";
import { Stripe } from "stripe";
import { initCustomer } from "tests/utils/init.js";

// UNCOMMENT FROM HERE
describe(`${chalk.yellowBright(
  "referrals1: Testing referrals (on checkout)"
)}`, () => {
  let mainCustomerId = "main-referral-1";
  let alternateCustomerId = "alternate-referral-1";
  let redeemers = ["referral1-r1", "referral1-r2", "referral1-r3"];
  let autumn: Autumn;
  let stripeCli: Stripe;
  let testClockId: string;
  let referralCode: ReferralCode;

  let redemptions: RewardRedemption[] = [];
  let mainCustomer: Customer;

  before(async function () {
    await setupBefore(this);
    autumn = this.autumn;
    stripeCli = this.stripeCli;

    const { testClockId: testClockId1, customer } =
      await initCustomerWithTestClock({
        customerId: mainCustomerId,
        sb: this.sb,
        org: this.org,
        env: this.env,
        fingerprint: "main-referral-1",
      });
    testClockId = testClockId1;
    mainCustomer = customer;

    await autumn.attach({
      customerId: mainCustomerId,
      productId: products.proWithTrial.id,
    });

    let batchCreate = [];
    for (let redeemer of redeemers) {
      batchCreate.push(
        initCustomer({
          customerId: redeemer,
          sb: this.sb,
          org: this.org,
          env: this.env,
          attachPm: true,
        })
      );
    }

    batchCreate.push(
      initCustomer({
        customer_data: {
          id: alternateCustomerId,
          name: "Alternate Referral 1",
          email: "alternate-referral-1@example.com",
          fingerprint: "main-referral-1",
        },
        sb: this.sb,
        org: this.org,
        env: this.env,
      })
    );
    await Promise.all(batchCreate);
  });

  it("should create code once", async function () {
    referralCode = await autumn.referrals.createCode({
      customerId: mainCustomerId,
      referralId: referralPrograms.onCheckout.id,
    });

    assert.exists(referralCode.code);

    // Get referral code again
    let referralCode2 = await autumn.referrals.createCode({
      customerId: mainCustomerId,
      referralId: referralPrograms.onCheckout.id,
    });

    assert.equal(referralCode2.code, referralCode.code);
  });

  it("should fail if same customer tries to redeem code again", async function () {
    try {
      await autumn.referrals.redeem({
        customerId: mainCustomerId,
        code: referralCode.code,
      });
      assert.fail("Own customer should not be able to redeem code");
    } catch (error) {
      assert.instanceOf(error, AutumnError);
      assert.equal(error.code, ErrCode.CustomerCannotRedeemOwnCode);
    }

    try {
      await autumn.referrals.redeem({
        customerId: alternateCustomerId,
        code: referralCode.code,
      });
      assert.fail(
        "Own customer (same fingerprint) should not be able to redeem code"
      );
    } catch (error) {
      assert.instanceOf(error, AutumnError);
      assert.equal(error.code, ErrCode.CustomerCannotRedeemOwnCode);
    }
  });

  it("should create redemption for each redeemer and fail if redeemed again", async function () {
    for (let redeemer of redeemers) {
      let redemption: RewardRedemption = await autumn.referrals.redeem({
        customerId: redeemer,
        code: referralCode.code,
      });

      redemptions.push(redemption);

      // assert.equal(redemption.triggered, false);
      // assert.equal(redemption.applied, false);
    }

    // Try redeem for redeemer1 again
    try {
      let redemption1 = await autumn.referrals.redeem({
        customerId: redeemers[0],
        code: referralCode.code,
      });
      assert.fail("Should not be able to redeem again");
    } catch (error) {
      assert.instanceOf(error, AutumnError);
      assert.equal(error.code, ErrCode.CustomerAlreadyRedeemedReferralCode);
    }
  });

  it("should be triggered (and applied) when redeemers check out", async function () {
    for (let i = 0; i < redeemers.length; i++) {
      let redeemer = redeemers[i];

      await autumn.attach({
        customerId: redeemer,
        productId: products.pro.id,
      });

      await timeout(3000);

      // Get redemption object
      let redemption = await autumn.redemptions.get(redemptions[i].id);

      // Check if redemption is triggered
      let count = i + 1;

      if (count > referralPrograms.onCheckout.max_redemptions) {
        assert.equal(redemption.triggered, false);
        assert.equal(redemption.applied, false);
      } else {
        assert.equal(redemption.triggered, true);
        assert.equal(redemption.applied, i == 0);
      }

      // Check stripe customer
      let stripeCus = (await stripeCli.customers.retrieve(
        mainCustomer.processor?.id
      )) as Stripe.Customer;

      assert.notEqual(stripeCus.discount, null);
    }
  });

  let curTime = new Date();
  it("customer should have discount for first purchase", async function () {
    curTime = addHours(addDays(curTime, 7), 4);
    await advanceTestClock({
      testClockId,
      advanceTo: curTime.getTime(),
      stripeCli,
    });

    // 1. Get invoice
    let { invoices } = await autumn.customers.get(mainCustomerId);

    assert.equal(invoices.length, 2);
    assert.equal(invoices[0].total, 0);
  });

  it("customer should have discount for second purchase", async function () {
    // 2. Check that customer has another discount
    let stripeCus = (await stripeCli.customers.retrieve(
      mainCustomer.processor?.id
    )) as Stripe.Customer;

    assert.notEqual(stripeCus.discount, null);

    // 2. Advance test clock to 1 month from start (trigger discount.deleted event)
    curTime = addHours(addMonths(new Date(), 1), 2);
    await advanceTestClock({
      testClockId,
      advanceTo: curTime.getTime(),
      stripeCli,
    });

    // 3. Advance test clock to 1 month + 7 days from start (trigger new invoice)
    curTime = addDays(curTime, 8);
    await advanceTestClock({
      testClockId,
      advanceTo: curTime.getTime(),
      stripeCli,
    });

    // // 3. Get invoice again
    let { invoices: invoices2 } = await autumn.customers.get(mainCustomerId);

    assert.equal(invoices2.length, 3);
    assert.equal(invoices2[0].total, 0);
  });
});
