import chalk from "chalk";
import { addDays, addMonths, differenceInDays } from "date-fns";
import { initCustomerWithTestClock } from "../../utils/testInitUtils.js";
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
import { getPriceForOverage } from "@/internal/products/prices/priceUtils.js";

const ASSERT_INVOICE_AMOUNT = true;

// SECOND, UPGRADE TO GPU PRO MONTHLY
describe(`${chalk.yellowBright(
  "usage3: upgrade from GPU starter monthly to GPU pro monthly",
)}`, () => {
  const customerId = "usage3";
  let testClockId = "";
  let totalCreditsUsed = 0;
  let daysAdd1 = 15;
  // let daysAdd2 = differenceInDays(
  //   addMonths(new Date(), 1),
  //   addDays(new Date(), daysAdd1)
  // );

  before(async function () {
    let { testClockId: insertedTestClockId } = await initCustomerWithTestClock({
      customerId,
      org: this.org,
      env: this.env,
      db: this.db,
    });

    testClockId = insertedTestClockId;
  });

  // 1. Attach GPU starter monthly
  it("usage3: should attach GPU starter monthly", async function () {
    const res = await AutumnCli.attach({
      customerId: customerId,
      productId: advanceProducts.gpuSystemStarter.id,
    });

    await timeout(3000);
  });

  // 2. Send 20 events
  it("usage3: should send 20 events", async function () {
    this.timeout(30000);
    // console.log("   Sending 20 events");

    let eventCount = 20;
    const { creditsUsed } = await sendGPUEvents({
      customerId,
      eventCount,
    });

    console.log("     - Total credits used: ", creditsUsed);
    totalCreditsUsed = creditsUsed;
  });

  // 3. Advance test clock by 15 days and upgrade
  it("usage3: should advance test clock by 15 days and upgrade to GPU pro monthly", async function () {
    const stripeCli = createStripeCli({ org: this.org, env: this.env });
    await advanceTestClock({
      stripeCli,
      testClockId,
      numberOfDays: 15,
    });

    await AutumnCli.attach({
      customerId: customerId,
      productId: advanceProducts.gpuSystemPro.id,
    });

    await timeout(3000);
  });

  // 4. Check product attached
  it("usage3: should have correct product attached (GPU pro monthly)", async function () {
    this.timeout(30000);

    const res = await AutumnCli.getCustomer(customerId);
    compareMainProduct({
      sent: advanceProducts.gpuSystemPro,
      cusRes: res,
    });

    // MAKE SURE STRIPE SUB ONLY HAS GPU PRO
    const stripeCli = createStripeCli({ org: this.org, env: this.env });
    let subscriptionId = res.products[0].subscription_ids![0]!;

    await checkSubscriptionContainsProducts({
      db: this.db,
      org: this.org,
      env: this.env,
      subscriptionId,
      productIds: [advanceProducts.gpuSystemPro.id],
    });
  });

  // 5. Check invoice for 15 days of starter usage
  it("usage3: should have invoice for 15 days of starter usage", async function () {
    const res = await AutumnCli.getCustomer(customerId);
    const invoices = res!.invoices;

    let invoiceIndex = invoices.findIndex((invoice: any) =>
      invoice.product_ids.includes(advanceProducts.gpuSystemStarter.id),
    );

    // console.log("Total usage: ", totalCreditsUsed);

    await checkUsageInvoiceAmount({
      invoices,
      totalUsage: totalCreditsUsed,
      product: advanceProducts.gpuSystemStarter,
      featureId: creditSystems.gpuCredits.id,
      invoiceIndex,
      includeBase: false,
    });
  });

  return;

  // 6. Advance another 15 days and check invoice for pro usage
  it("usage3: should 20 send events (GPU pro monthly)", async function () {
    let eventCount = 20;
    const { creditsUsed } = await sendGPUEvents({
      customerId,
      eventCount,
    });

    totalCreditsUsed = creditsUsed;
    console.log("   - Total credits used: ", totalCreditsUsed);

    // Check entitled
    const { allowed, balanceObj }: any = await AutumnCli.entitled(
      customerId,
      creditSystems.gpuCredits.id,
      true,
    );

    let proAllowance =
      advanceProducts.gpuSystemPro.entitlements.gpuCredits.allowance!;
    try {
      assert.equal(allowed, true);
      assert.equal(
        balanceObj.balance,
        new Decimal(proAllowance).minus(totalCreditsUsed).toNumber(),
      );
    } catch (error) {
      console.group();
      console.log("   - Total credits used: ", totalCreditsUsed);
      console.log("   - Pro allowance: ", proAllowance);
      console.log("   - Balance: ", balanceObj.balance);
      console.groupEnd();
      throw error;
    }
  });

  // 7. Advance another 15 days and check invoice for pro usage
  it("usage3: should have invoice for 15 days of pro usage", async function () {
    const stripeCli = createStripeCli({ org: this.org, env: this.env });
    await advanceClockForInvoice({
      stripeCli,
      testClockId,
      waitForMeterUpdate: ASSERT_INVOICE_AMOUNT,
    });

    const res = await AutumnCli.getCustomer(customerId);
    const invoices = res!.invoices;

    await checkUsageInvoiceAmount({
      invoices,
      totalUsage: totalCreditsUsed,
      product: advanceProducts.gpuSystemPro,
      featureId: creditSystems.gpuCredits.id,
    });
  });
});
