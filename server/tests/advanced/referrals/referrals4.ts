import { features, products, referralPrograms } from "../../global.js";
import { assert } from "chai";
import chalk from "chalk";
import { setupBefore } from "tests/before.js";
import { Customer, ReferralCode, RewardRedemption } from "@autumn/shared";
import { timeout } from "tests/utils/genUtils.js";
import { initCustomerWithTestClock } from "tests/utils/testInitUtils.js";
import { Stripe } from "stripe";
import { initCustomer } from "tests/utils/init.js";
import { compareProductEntitlements } from "tests/utils/compare.js";
import { addDays, addHours } from "date-fns";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { hoursToFinalizeInvoice } from "tests/utils/constants.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

// UNCOMMENT FROM HERE
describe(`${chalk.yellowBright(
  "referrals4: Testing free product referrals with trial"
)}`, () => {
  let mainCustomerId = "main-referral-4";
  // let redeemers = ["referral4-r1", "referral4-r2"];
  let redeemerId = "referral4-r1";

  let autumn: AutumnInt = new AutumnInt();
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
      db: this.db,
      org: this.org,
      env: this.env,
      attachPm: true,
    });

    await autumn.attach({
      customer_id: mainCustomerId,
      product_id: products.proWithTrial.id,
    });

    let { testClockId: testClockId1, customer } =
      await initCustomerWithTestClock({
        customerId: redeemerId,
        db: this.db,
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
      customer_id: redeemerId,
      product_id: products.proWithTrial.id,
    });

    await timeout(3000);

    // Get redemption object
    let redemption = await autumn.redemptions.get(redemptions[0].id);

    assert.equal(redemption.triggered, false);
  });

  it("should be triggered after trial ends", async function () {
    let advanceTo = addHours(
      addDays(new Date(), 7),
      hoursToFinalizeInvoice
    ).getTime();
    await advanceTestClock({
      stripeCli,
      testClockId,
      advanceTo,
      waitForSeconds: 30,
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
