import { Customer } from "@autumn/shared";
import chalk from "chalk";
import { initCustomerWithTestClock } from "../../utils/testInitUtils.js";
import { compareMainProduct } from "../../utils/compare.js";
import { AutumnCli } from "../../cli/AutumnCli.js";
import { advanceProducts, creditSystems } from "../../global.js";
import { timeout } from "../../utils/genUtils.js";
import { assert, expect } from "chai";
import { createStripeCli } from "@/external/stripe/utils.js";
import {
  advanceClockForInvoice,
  advanceMonths,
  checkBillingMeterEventSummary,
  getUsageInArrearPrice,
} from "../../utils/stripeUtils.js";
import { addMonths } from "date-fns";
import {
  sendGPUEvents,
  checkCreditBalance,
  checkUsageInvoiceAmount,
} from "../../utils/advancedUsageUtils.js";

// THIRD, TEST GPU PRO ANNUAL
describe(`${chalk.yellowBright("multi_interval1: GPU starter annual")}`, () => {
  const customerId = "advancedUsageAnnual";
  let testClockId = "";
  let totalCreditsUsed = 0;
  let customer: Customer;
  before(async function () {
    this.timeout(30000);

    let { testClockId: insertedTestClockId, customer: insertedCustomer } =
      await initCustomerWithTestClock({
        customerId,
        org: this.org,
        env: this.env,
        sb: this.sb,
      });

    testClockId = insertedTestClockId;
    customer = insertedCustomer;
    console.log("Testing multi interval 1");
  });

  it("should attach GPU starter annual", async function () {
    this.timeout(30000);

    const res = await AutumnCli.attach({
      customerId: customerId,
      productId: advanceProducts.gpuStarterAnnual.id,
    });

    await timeout(3000);
  });

  it("should have GPU starter annual product", async function () {
    this.timeout(30000);

    const res = await AutumnCli.getCustomer(customerId);
    compareMainProduct({
      sent: advanceProducts.gpuStarterAnnual,
      cusRes: res,
    });

    // Should have 2 invoices (one for annual, one for monthly)
    expect(res!.invoices.length).to.equal(2);
  });

  it("should send 20 events and have correct balance", async function () {
    this.timeout(30000);

    let eventCount = 20;
    const { creditsUsed } = await sendGPUEvents({
      customerId,
      eventCount,
    });

    totalCreditsUsed = creditsUsed;
    console.log("   - Total credits used: ", totalCreditsUsed);
    await checkCreditBalance({
      customerId,
      featureId: creditSystems.gpuCredits.id,
      totalCreditsUsed,
      originalAllowance:
        advanceProducts.gpuStarterAnnual.entitlements.gpuCredits.allowance!,
    });
  });

  // Advance by a month and check if latest invoice is correct
  it("should have invoice after a month and correct balance", async function () {
    const stripeCli = createStripeCli({ org: this.org, env: this.env });
    await advanceClockForInvoice({
      stripeCli,
      testClockId,
      waitForMeterUpdate: true,
    });

    const res = await AutumnCli.getCustomer(customerId);
    const invoices = res!.invoices;

    let invoiceIndex = invoices.findIndex((invoice: any) =>
      invoice.product_ids.includes(advanceProducts.gpuStarterAnnual.id)
    );

    await checkUsageInvoiceAmount({
      invoices,
      totalUsage: totalCreditsUsed,
      product: advanceProducts.gpuStarterAnnual,
      featureId: creditSystems.gpuCredits.id,
      invoiceIndex,
      includeBase: false,
    });

    await checkCreditBalance({
      customerId,
      featureId: creditSystems.gpuCredits.id,
      totalCreditsUsed: 0,
      originalAllowance:
        advanceProducts.gpuStarterAnnual.entitlements.gpuCredits.allowance!,
    });
  });

  // Advance by 1 year and check if latest invoice is correct
  it.skip("should have correct invoice after 1 year", async function () {
    const stripeCli = createStripeCli({ org: this.org, env: this.env });

    // 1. Advance by 11 months
    let numberOfMonths = 11;
    await advanceMonths({
      stripeCli,
      testClockId,
      numberOfMonths,
    });

    // 2. Send 20 events
    let eventCount = 20;
    const { creditsUsed } = await sendGPUEvents({
      customerId,
      eventCount,
    });

    let totalCreditsUsed = creditsUsed;
    console.log("   - Total credits used: ", totalCreditsUsed);

    // Advance by a month and check for usage
    await advanceClockForInvoice({
      stripeCli,
      testClockId,
      waitForMeterUpdate: true,
      startingFrom: addMonths(new Date(), numberOfMonths),
    });

    const res = await AutumnCli.getCustomer(customerId);
    const invoices = res!.invoices;

    let usagePrice = await getUsageInArrearPrice({
      org: this.org,
      sb: this.sb,
      env: this.env,
      productId: advanceProducts.gpuStarterAnnual.id,
    });

    // Get billing meter event summary
    let eventSummary = await checkBillingMeterEventSummary({
      stripeCli,
      startTime: addMonths(new Date(), 11),
      stripeMeterId: usagePrice?.config?.stripe_meter_id,
      stripeCustomerId: customer.processor.id,
    });

    try {
      assert.exists(eventSummary);
      assert.equal(
        eventSummary?.aggregated_value,
        Math.round(totalCreditsUsed)
      );
      assert.equal(invoices.length, 13 + 2);
    } catch (error) {
      console.group();
      console.log("   - Event summary: ", eventSummary);
      console.log("   - Total credits used: ", totalCreditsUsed);
      console.log("   - Last 3 invoices: ", invoices.slice(-3));
      console.groupEnd();
      throw error;
    }
  });
});
