// THIS TEST CASE IS COVERED UNDER UPGRADE2.TS

// import { Customer } from "@autumn/shared";
// import chalk from "chalk";
// import { compareMainProduct } from "../../utils/compare.js";
// import { AutumnCli } from "../../cli/AutumnCli.js";
// import { advanceProducts, creditSystems } from "../../global.js";
// import { timeout } from "../../utils/genUtils.js";
// import { assert, expect } from "chai";
// import { createStripeCli } from "@/external/stripe/utils.js";
// import {
//   advanceClockForInvoice,
//   advanceMonths,
//   advanceTestClock,
//   checkBillingMeterEventSummary,
//   getUsageInArrearPrice,
// } from "../../utils/stripeUtils.js";
// import { addMonths } from "date-fns";
// import {
//   sendGPUEvents,
//   checkUsageInvoiceAmount,
// } from "../../utils/advancedUsageUtils.js";
// import { Decimal } from "decimal.js";
// import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
// import { setupBefore } from "tests/before.js";
// import Stripe from "stripe";

// // FOURTH, TEST GPU STARTER ANNUAL UPGRADE TO GPU PRO

// const testCase = "usage5";
// describe(`${chalk.yellowBright("usage5: multi interval upgrade, GPU starter annual -> GPU pro annual")}`, () => {
//   const customerId = testCase;
//   let testClockId = "";
//   let totalCreditsUsed = 0;
//   let customer: Customer;
//   let stripeCli: Stripe;

//   let curTime = new Date();
//   before(async function () {
//     await setupBefore(this);
//     let res = await initCustomer({
//       customerId,
//       org: this.org,
//       env: this.env,
//       db: this.db,
//       autumn: this.autumnJs,
//       attachPm: "success",
//     });

//     testClockId = res.testClockId;
//     customer = res.customer;
//     stripeCli = this.stripeCli;
//   });

//   it("should attach GPU starter annual", async function () {
//     await AutumnCli.attach({
//       customerId: customerId,
//       productId: advanceProducts.gpuStarterAnnual.id,
//     });

//     const res = await AutumnCli.getCustomer(customerId);
//     compareMainProduct({
//       sent: advanceProducts.gpuStarterAnnual,
//       cusRes: res,
//     });
//   });

//   it(`should advance 1 month and upgrade to GPU pro monthly`, async function () {
//     let numberOfMonths = 1;
//     await advanceMonths({
//       stripeCli,
//       testClockId,
//       numberOfMonths,
//     });

//     curTime = addMonths(curTime, numberOfMonths);

//     // Send 20 events
//     let eventCount = 20;
//     const { creditsUsed } = await sendGPUEvents({
//       customerId,
//       eventCount,
//     });

//     totalCreditsUsed = creditsUsed;

//     await AutumnCli.attach({
//       customerId: customerId,
//       productId: advanceProducts.gpuProAnnual.id,
//     });

//     await advanceTestClock({
//       stripeCli,
//       testClockId,
//       numberOfDays: 10,
//       startingFrom: curTime,
//     });
//   });

//   it("should have GPU pro annual product and 2 Stripe subscriptions", async function () {
//     const res = await AutumnCli.getCustomer(customerId);
//     compareMainProduct({
//       sent: advanceProducts.gpuProAnnual,
//       cusRes: res,
//     });

//     // Should have 2 subscriptions
//     const subs = await stripeCli.subscriptions.list({
//       customer: customer.processor.id,
//     });

//     expect(subs.data.length).to.equal(2);
//   });

//   it("should have correct invoice for GPU starter annual (bill for remaining usages)", async function () {
//     const res = await AutumnCli.getCustomer(customerId);
//     const invoices = res!.invoices;

//     let invoiceIndex = invoices.findIndex((invoice: any) =>
//       invoice.product_ids.includes(advanceProducts.gpuStarterAnnual.id),
//     );

//     await checkUsageInvoiceAmount({
//       invoices,
//       totalUsage: totalCreditsUsed,
//       product: advanceProducts.gpuStarterAnnual,
//       featureId: creditSystems.gpuCredits.id,
//       invoiceIndex,
//       includeBase: false,
//     });
//   });

//   it("should send 20 events (on GPU pro annual)", async function () {
//     const stripeCli = createStripeCli({ org: this.org, env: this.env });
//     // Send 20 events
//     let eventCount = 20;
//     const { creditsUsed } = await sendGPUEvents({
//       customerId,
//       eventCount,
//     });

//     totalCreditsUsed = creditsUsed;

//     await advanceClockForInvoice({
//       stripeCli,
//       testClockId,
//       waitForMeterUpdate: true,
//       startingFrom: curTime,
//     });
//   });

//   it("should have correct billing meter event summary for GPU pro annual", async function () {
//     const res = await AutumnCli.getCustomer(customerId);
//     const invoices = res!.invoices;

//     // Think I have to use Stripe metered event summary to check this
//     let usagePrice = await getUsageInArrearPrice({
//       org: this.org,
//       sb: this.sb,
//       env: this.env,
//       productId: advanceProducts.gpuProAnnual.id,
//     });

//     let eventSummary = await checkBillingMeterEventSummary({
//       stripeCli,
//       startTime: curTime, // Wrong date?
//       stripeMeterId: usagePrice?.config?.stripe_meter_id,
//       stripeCustomerId: customer.processor.id,
//     });

//     let roundedFirst = Math.ceil(
//       new Decimal(totalCreditsUsed)
//         .div(usagePrice?.config?.billing_units!)
//         .toNumber(),
//     );
//     let roundedTotalCreditsUsed = new Decimal(roundedFirst)
//       .mul(usagePrice?.config?.billing_units!)
//       .toNumber();
//     try {
//       assert.exists(eventSummary);
//       assert.equal(eventSummary?.aggregated_value, roundedTotalCreditsUsed);
//     } catch (error) {
//       console.group();
//       console.log("   - Event summary: ", eventSummary);
//       console.log("   - Total credits used: ", totalCreditsUsed);
//       console.groupEnd();
//       throw error;
//     }

//     // await checkUsageInvoiceAmount({
//     //   invoices,
//     //   totalUsage: totalCreditsUsed,
//     //   product: advanceProducts.gpuProAnnual,
//     //   featureId: creditSystems.gpuCredits.id,
//     //   invoiceIndex: 0,
//     //   includeBase: false,
//     // });
//   });
// });
