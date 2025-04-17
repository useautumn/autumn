import { features, products, referralPrograms } from "../../global.js";
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
import { Stripe } from "stripe";
import { initCustomer } from "tests/utils/init.js";
import { compareProductEntitlements } from "tests/utils/compare.js";

// UNCOMMENT FROM HERE
describe(`${chalk.yellowBright(
  "referrals3: Testing free product referrals"
)}`, () => {
  let mainCustomerId = "main-referral-3";
  let redeemers = ["referral3-r1", "referral3-r2", "referral3-r3"];
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
        fingerprint: "main-referral-3",
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

    await Promise.all(batchCreate);
  });

  it("should create code once", async function () {
    referralCode = await autumn.referrals.createCode({
      customerId: mainCustomerId,
      referralId: referralPrograms.freeProduct.id,
    });

    assert.exists(referralCode.code);
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

      if (count > referralPrograms.freeProduct.max_redemptions) {
        assert.equal(redemption.triggered, false);
        assert.equal(redemption.applied, false);
      } else {
        // 1. Check that main customer has free add on
        compareProductEntitlements({
          customerId: mainCustomerId,
          product: products.freeAddOn,
          features,
          quantity: count,
        });

        compareProductEntitlements({
          customerId: redeemer,
          product: products.freeAddOn,
          features,
        });
      }
    }
  });
});
