// import { assert, expect } from "chai";
// import { AutumnCli } from "tests/cli/AutumnCli.js";
// import { advanceProducts, features } from "tests/global.js";
// import { compareMainProduct } from "tests/utils/compare.js";
// import {
//   advanceClockForInvoice,
//   advanceTestClock,
// } from "../../utils/stripeUtils.js";
// import { timeout } from "../../utils/genUtils.js";
// import { createStripeCli } from "@/external/stripe/utils.js";
// import { addDays } from "date-fns";
// import chalk from "chalk";
// import Stripe from "stripe";

// import { initCustomerWithTestClock } from "tests/utils/testInitUtils.js";

// const advanceArrearProratedCycle = async ({
//   stripeSub,
//   stripeCli,
//   testClockId,
//   customerId,
//   billingUnits,
//   startingFrom,
//   startingBalance,
// }: {
//   stripeSub: Stripe.Subscription;
//   stripeCli: Stripe;
//   testClockId: string;
//   customerId: string;
//   billingUnits: number;
//   startingFrom?: number;
//   startingBalance?: number;
// }) => {
//   // 1. Get total period
//   let totalPeriod =
//     (stripeSub.current_period_end - stripeSub.current_period_start) * 1000;

//   // 2. Get allowance
//   let allowance =
//     advanceProducts.proratedArrearSeats.entitlements.seats.allowance!;

//   // 3. Get starting balance
//   let balance = startingBalance || allowance;

//   // 4. Get price per seat
//   let pricePerSeat =
//     advanceProducts.proratedArrearSeats.prices[1].config.usage_tiers[0].amount;

//   let skipDays = 2;
//   // 5. Get accrued price
//   let accruedPrice = 0;
//   if (startingBalance) {
//     accruedPrice =
//       (-startingBalance *
//         pricePerSeat *
//         (startingFrom! - stripeSub.current_period_start * 1000)) /
//       totalPeriod;
//     accruedPrice = Math.max(accruedPrice, 0);
//     console.log("   🔍 Starting balance: ", startingBalance);
//     console.log("   🔍 Starting price: ", accruedPrice);
//   }

//   let curTime = startingFrom || stripeSub.current_period_start * 1000;
//   let numberOfEvents = 2;

//   console.group();
//   console.group();
//   for (let i = 0; i < numberOfEvents; i++) {
//     let sign = balance > 0 ? 1 : Math.random() > 0.5 ? 1 : -1;

//     let currentUsage = allowance - balance;

//     let nextBoundary =
//       Math.ceil((currentUsage + 1) / billingUnits) * billingUnits;
//     let prevBoundary = nextBoundary - billingUnits;

//     let valueNeeded = 0;
//     if (sign > 0) {
//       // Add random amount to push above next boundary
//       const valueToGetToNegative = balance + 1;
//       valueNeeded =
//         Math.floor(Math.random() * 10) + (nextBoundary - currentUsage + 1);

//       valueNeeded = Math.max(valueNeeded, valueToGetToNegative);
//     } else {
//       valueNeeded = -(
//         Math.floor(Math.random() * 10) +
//         (currentUsage - prevBoundary + 1)
//       );
//     }

//     let firstHalf = Math.floor(valueNeeded / 2);
//     let secondHalf = valueNeeded - firstHalf;

//     // Test event sending in quick succession
//     await AutumnCli.sendEvent({
//       customerId,
//       eventName: features.seats.id,
//       properties: {
//         value: firstHalf,
//       },
//     });

//     await AutumnCli.sendEvent({
//       customerId,
//       eventName: features.seats.id,
//       properties: {
//         value: secondHalf,
//       },
//     });

//     await timeout(2000);

//     let prevBalance = balance;
//     balance -= valueNeeded;

//     // Calculate prorated price only when crossing boundary
//     let newPrice = Math.max(0, -balance * pricePerSeat);
//     let prevCurTime = curTime;
//     curTime = addDays(curTime, 2).getTime();

//     if (i === numberOfEvents - 1) {
//       curTime = stripeSub.current_period_end * 1000;
//     }

//     let proratedPrice = (newPrice * (curTime - prevCurTime)) / totalPeriod;
//     accruedPrice += Number(proratedPrice.toFixed(2));

//     console.log(`Event ${i + 1}:`);
//     console.log(`  - Value added: ${valueNeeded}`);
//     console.log(`  - Balance: ${prevBalance} -> ${balance}`);
//     console.log(`  - Prorated price: ${proratedPrice.toFixed(2)}`);
//     console.log(`  - Accrued price: ${accruedPrice.toFixed(2)}`);

//     await advanceTestClock({
//       stripeCli,
//       testClockId,
//       numberOfDays: 2,
//       startingFrom: new Date(prevCurTime),
//     });
//   }

//   console.groupEnd();
//   console.groupEnd();

//   // Advance test clock to end of period
//   // let advanceTo = addDays(addMonths(new Date(), 1), 2);

//   let advanceToStart = startingFrom ? new Date(startingFrom) : new Date();
//   let advanceTo = await advanceClockForInvoice({
//     stripeCli,
//     testClockId,
//     waitForMeterUpdate: false,
//     // numberOfDays: 2,
//     startingFrom: advanceToStart,
//   });

//   // Check invoice amount
//   const res = await AutumnCli.getCustomer(customerId);
//   let invoice = res.invoices[0];

//   let basePrice = advanceProducts.proratedArrearSeats.prices[0].config.amount;
//   let nextMonthUsagePrice = Math.max(-balance * pricePerSeat, 0);
//   console.log("   🔍 Next month usage price: ", nextMonthUsagePrice);

//   let expectedTotal = Number(
//     (accruedPrice + basePrice + nextMonthUsagePrice).toFixed(2)
//   );
//   expect(invoice.total).to.be.greaterThan(expectedTotal - 0.01);
//   expect(invoice.total).to.be.lessThan(expectedTotal + 0.01);

//   return {
//     balance,
//     advancedTo: advanceTo,
//   };
// };

// describe(`${chalk.yellowBright(
//   "Testing in_arrear_prorated -- update via events"
// )}`, () => {
//   const customerId = "arrear-prorated-events";

//   let testClockId = "";
//   let stripeCli: Stripe;
//   let subId = "";
//   let stripeSub: Stripe.Subscription;
//   let billingUnits =
//     advanceProducts.proratedArrearSeats.prices[1].config.billing_units || 1;

//   before(async function () {
//     const { testClockId: createdTestClockId } = await initCustomerWithTestClock(
//       {
//         customerId,
//         org: this.org,
//         env: this.env,
//         sb: this.sb,
//       }
//     );

//     stripeCli = createStripeCli({
//       org: this.org,
//       env: this.env,
//     });

//     testClockId = createdTestClockId;
//   });

//   it("should attach in arrear prorated seats", async () => {
//     await AutumnCli.attach({
//       customerId,
//       productId: advanceProducts.proratedArrearSeats.id,
//     });
//   });

//   it("should have correct product", async () => {
//     const res = await AutumnCli.getCustomer(customerId);
//     compareMainProduct({
//       sent: advanceProducts.proratedArrearSeats,
//       cusRes: res,
//     });

//     // 2. Get subscription period start and period end
//     subId = res.products[0].subscription_ids[0];
//     stripeSub = await stripeCli.subscriptions.retrieve(subId);
//   });

//   it("should run two cycles and have correct invoice / balance", async () => {
//     // Do it again
//     let { advancedTo, balance } = await advanceArrearProratedCycle({
//       stripeSub,
//       stripeCli,
//       testClockId,
//       customerId,
//       billingUnits,
//     });

//     // console.log(`   Advanced to ${format(new Date(advancedTo), "yyyy-MM-dd")}`);

//     // let newStripeSub = await stripeCli.subscriptions.retrieve(subId);
//     // await advanceArrearProratedCycle({
//     //   stripeSub: newStripeSub,
//     //   stripeCli,
//     //   testClockId,
//     //   customerId,
//     //   billingUnits,
//     //   startingFrom: advancedTo,
//     //   startingBalance: balance,
//     // });
//   });

//   // TODO: Test reset at for in arrear prorated with Ent Interval = Lifetime
//   // TODO: Test in arrear prorated for entitlements with billing units > 1
//   return;
// });
