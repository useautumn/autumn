// import { createStripeCli } from "@/external/stripe/utils.js";
// import { addMonths } from "date-fns";
// import Stripe from "stripe";
// import { AutumnCli } from "tests/cli/AutumnCli.js";
// import { advanceProducts } from "tests/global.js";
// import {
//   checkProductIsScheduled,
//   compareMainProduct,
// } from "tests/utils/compare.js";
// import { initCustomer } from "tests/utils/init.js";
// import { advanceClockForInvoice } from "tests/utils/stripeUtils.js";
// import { advanceMonths } from "tests/utils/stripeUtils.js";
// import { initCustomerWithTestClock } from "tests/utils/testInitUtils.js";

// // TEST MULTI INTERVAL DOWNGRADE
// //
// /*
// CASE 1: Annual pro -> Annual starter
//   - If attach annual starter, should schedule correctly [DONE]
//   - If advance test clock, should downgrade correctly (to monthly starter) [DONE]
//   - If cancel active subscription (on Stripe), should remove scheduled correctly [DONE]
//   - If cancel scheduled subscription (on Stripe), should remove scheduled correctly [DONE]
//   - If expire on dashboard, should remove scheduled correctly

//   - If upgrade back to annual pro, should remove scheduled correctly [DONE]
//   - If downgrade to monthly pro (switch downgrade), should be correct [DONE]
//   - If downgrade to free (switch downgrade), should be correct
// */

// describe.skip("Multi interval downgrade -- Quarterly pro -> Monthly pro", () => {
//   let customerId = "multi-interval-downgrade";
//   let customer;
//   let stripeCli: Stripe;
//   let testClockId: string;

//   before(async function () {
//     const { testClockId: insertedTestClockId } =
//       await initCustomerWithTestClock({
//         customerId,
//         org: this.org,
//         env: this.env,
//         sb: this.sb,
//       });
//     testClockId = insertedTestClockId;
//     stripeCli = createStripeCli({
//       org: this.org,
//       env: this.env,
//     });
//   });

//   it("should attach quarterly pro", async function () {
//     let res = await AutumnCli.attach({
//       customerId: customerId,
//       productId: advanceProducts.gpuProQuarter.id,
//     });

//     let cusRes = await AutumnCli.getCustomer(customerId);
//     compareMainProduct(advanceProducts.gpuProQuarter, cusRes);
//   });

//   it("should attach downgrade to monthly pro", async function () {
//     let res = await AutumnCli.attach({
//       customerId: customerId,
//       productId: advanceProducts.gpuSystemPro.id,
//     });

//     let cusRes = await AutumnCli.getCustomer(customerId);
//     checkProductIsScheduled({
//       cusRes,
//       product: advanceProducts.gpuSystemPro,
//     });
//   });

//   it("should advance clock by a year", async function () {
//     // let numberOfMonths = 2;
//     // await advanceMonths({
//     //   stripeCli,
//     //   testClockId,
//     //   numberOfMonths,
//     // });
//   });
// });

// describe("Multi interval downgrade -- Annual pro -> Annual starter", () => {
//   let customerId = "multi-interval-downgrade";
//   let customer;
//   let stripeCli;
//   let testClockId: string;

//   before(async function () {
//     await initCustomer({
//       customer_data: {
//         id: customerId,
//         name: customerId,
//         email: "multi-interval-downgrade@example.com",
//       },
//       attachPm: true,
//       org: this.org,
//       env: this.env,
//       sb: this.sb,
//     });
//     // const { testClockId: insertedTestClockId } =
//     //   await initCustomerWithTestClock({
//     //     customerId,
//     //     org: this.org,
//     //     env: this.env,
//     //     sb: this.sb,
//     //   });
//     // testClockId = insertedTestClockId;

//     // stripeCli = createStripeCli({
//     //   org: this.org,
//     //   env: this.env,
//     // });
//   });

//   it("should attach annual pro", async function () {
//     let res = await AutumnCli.attach({
//       customerId: customerId,
//       productId: advanceProducts.gpuProAnnual.id,
//     });

//     let cusRes = await AutumnCli.getCustomer(customerId);
//     compareMainProduct(advanceProducts.gpuProAnnual, cusRes);
//   });

//   it("should attach downgrade to annual starter", async function () {
//     let res = await AutumnCli.attach({
//       customerId: customerId,
//       productId: advanceProducts.gpuStarterAnnual.id,
//     });

//     let cusRes = await AutumnCli.getCustomer(customerId);
//     checkProductIsScheduled({
//       cusRes,
//       product: advanceProducts.gpuStarterAnnual,
//     });
//   });
// });
