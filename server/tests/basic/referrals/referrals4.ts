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
import { addDays, addHours } from "date-fns";
import { advanceTestClock } from "tests/utils/stripeUtils.js";

// UNCOMMENT FROM HERE
describe(`${chalk.yellowBright(
  "referrals4: Testing free product referrals with trial"
)}`, () => {
  let mainCustomerId = "main-referral-4";
  // let redeemers = ["referral4-r1", "referral4-r2"];
  let redeemerId = "referral4-r1";

  let autumn: Autumn;
  let stripeCli: Stripe;
  let referralCode: ReferralCode;

  let redemptions: RewardRedemption[] = [];
  let mainCustomer: Customer;
  let redeemer: Customer;

  let testClockId: string;
  before(async function () {
    await setupBefore(this);
    autumn = this.autumn;
    stripeCli = this.stripeCli;

    await initCustomer({
      customerId: mainCustomerId,
      sb: this.sb,
      org: this.org,
      env: this.env,
      attachPm: true,
    });

    await autumn.attach({
      customerId: mainCustomerId,
      productId: products.proWithTrial.id,
    });

    let { testClockId: testClockId1, customer } =
      await initCustomerWithTestClock({
        customerId: redeemerId,
        sb: this.sb,
        org: this.org,
        env: this.env,
      });

    testClockId = testClockId1;
    redeemer = customer;
  });

  it("should create referral code", async function () {
    referralCode = await autumn.referrals.createCode({
      customerId: mainCustomerId,
      referralId: referralPrograms.freeProduct.id,
    });

    assert.exists(referralCode.code);
  });

  it("should create redemption for each redeemer and fail if redeemed again", async function () {
    let redemption: RewardRedemption = await autumn.referrals.redeem({
      customerId: redeemerId,
      code: referralCode.code,
    });

    redemptions.push(redemption);
  });

  it("should not be triggered because of trial", async function () {
    await autumn.attach({
      customerId: redeemerId,
      productId: products.proWithTrial.id,
    });

    await timeout(3000);

    // Get redemption object
    let redemption = await autumn.redemptions.get(redemptions[0].id);

    assert.equal(redemption.triggered, false);
  });

  it("should be triggered after trial ends", async function () {
    let advanceTo = addHours(addDays(new Date(), 7), 2).getTime();
    await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo,
    });

    let redemption = await autumn.redemptions.get(redemptions[0].id);

    assert.equal(redemption.triggered, true);

    compareProductEntitlements({
      customerId: mainCustomerId,
      product: products.freeAddOn,
      features,
      quantity: 1,
    });

    compareProductEntitlements({
      customerId: redeemerId,
      product: products.freeAddOn,
      features,
      quantity: 1,
    });
  });
});
