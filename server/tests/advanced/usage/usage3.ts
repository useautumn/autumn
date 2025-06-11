import chalk from "chalk";
import { advanceProducts, creditSystems } from "../../global.js";
import { AutumnCli } from "../../cli/AutumnCli.js";
import {
  checkUsageInvoiceAmount,
  sendGPUEvents,
} from "../../utils/advancedUsageUtils.js";
import {
  advanceClockForInvoice,
  advanceTestClock,
} from "../../utils/stripeUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { timeout } from "../../utils/genUtils.js";
import { assert, expect } from "chai";
import { Decimal } from "decimal.js";
import { compareMainProduct } from "../../utils/compare.js";
import { checkSubscriptionContainsProducts } from "tests/utils/scheduleCheckUtils.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { setupBefore } from "tests/before.js";
import Stripe from "stripe";
import { priceToInvoiceAmount } from "@/internal/products/prices/priceUtils/priceToInvoiceAmount.js";
import { calculateProrationAmount } from "@/internal/invoices/prorationUtils.js";
import { getSubsFromCusId } from "tests/utils/expectUtils/expectSubUtils.js";

const testCase = "usage3";
const ASSERT_INVOICE_AMOUNT = true;

describe(`${chalk.yellowBright(
  "usage3: upgrade from GPU starter monthly to GPU pro monthly",
)}`, () => {
  const customerId = "usage3";
  let testClockId = "";
  let totalCreditsUsed = 0;
  let stripeCli: Stripe;
  let curUnix = 0;

  before(async function () {
    await setupBefore(this);
    let { testClockId: insertedTestClockId } = await initCustomer({
      customerId,
      org: this.org,
      env: this.env,
      db: this.db,
      autumn: this.autumnJs,
      attachPm: "success",
    });

    testClockId = insertedTestClockId;
    stripeCli = this.stripeCli;
  });

  // 1. Attach GPU starter monthly
  it("usage3: should attach GPU starter monthly", async function () {
    await AutumnCli.attach({
      customerId: customerId,
      productId: advanceProducts.gpuSystemStarter.id,
    });
  });

  // 2. Send 20 events
  it("usage3: should send 20 events", async function () {
    let eventCount = 20;
    const { creditsUsed } = await sendGPUEvents({
      customerId,
      eventCount,
    });

    totalCreditsUsed = creditsUsed;
  });

  // 3. Advance test clock by 15 days and upgrade
  it("should advance test clock by 15 days and upgrade to GPU pro monthly", async function () {
    curUnix = await advanceTestClock({
      stripeCli,
      testClockId,
      numberOfDays: 15,
    });

    await AutumnCli.attach({
      customerId: customerId,
      productId: advanceProducts.gpuSystemPro.id,
    });

    // MAKE SURE STRIPE SUB ONLY HAS GPU PRO

    const res = await AutumnCli.getCustomer(customerId);
    compareMainProduct({
      sent: advanceProducts.gpuSystemPro,
      cusRes: res,
    });

    let subscriptionId = res.products[0].subscription_ids![0]!;
    await checkSubscriptionContainsProducts({
      db: this.db,
      org: this.org,
      env: this.env,
      subscriptionId,
      productIds: [advanceProducts.gpuSystemPro.id],
    });
  });

  // 4. Check invoice for 15 days of starter usage
  it("should have invoice for 15 days of starter usage", async function () {
    const res = await AutumnCli.getCustomer(customerId);
    const invoices = res!.invoices;

    let basePrice1 = advanceProducts.gpuSystemStarter.prices[0].config.amount;
    let basePrice2 = advanceProducts.gpuSystemPro.prices[0].config.amount;

    let { subs } = await getSubsFromCusId({
      db: this.db,
      org: this.org,
      env: this.env,
      customerId,
      stripeCli,
      productId: advanceProducts.gpuSystemPro.id,
    });

    let sub = subs[0];

    let baseDiff = calculateProrationAmount({
      periodStart: sub.current_period_start * 1000,
      periodEnd: sub.current_period_end * 1000,
      now: curUnix,
      amount: basePrice2 - basePrice1,
      allowNegative: true,
    });

    let usagePrice = advanceProducts.gpuSystemStarter.prices[1];
    let overage =
      totalCreditsUsed -
      advanceProducts.gpuSystemStarter.entitlements.gpuCredits.allowance!;

    let overagePrice = priceToInvoiceAmount({
      price: usagePrice,
      overage,
    });

    let calculatedTotal = new Decimal(baseDiff)
      .plus(overagePrice)
      .toDecimalPlaces(2)
      .toNumber();

    expect(invoices[0].total).to.equal(calculatedTotal);
  });
});
