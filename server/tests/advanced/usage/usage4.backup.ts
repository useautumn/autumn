import type { Customer } from "@autumn/shared";
import { expect } from "chai";
import chalk from "chalk";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { AutumnCli } from "../../cli/AutumnCli.js";
import { advanceProducts, creditSystems } from "../../global.js";
import {
	checkCreditBalance,
	checkUsageInvoiceAmount,
	sendGPUEvents,
} from "../../utils/advancedUsageUtils.js";
import { compareMainProduct } from "../../utils/compare.js";
import { advanceClockForInvoice } from "../../utils/stripeUtils.js";

// THIRD, TEST GPU PRO ANNUAL

const testCase = "usage4";

describe(`${chalk.yellowBright("usage4: GPU starter annual")}`, () => {
	const customerId = testCase;
	let totalCreditsUsed = 0;

	let testClockId = "";
	let customer: Customer;
	let stripeCli: Stripe;

	before(async function () {
		await setupBefore(this);
		const res = await initCustomer({
			customerId,
			org: this.org,
			env: this.env,
			db: this.db,
			autumn: this.autumnJs,
			attachPm: "success",
		});

		testClockId = res.testClockId;
		customer = res.customer;
		stripeCli = this.stripeCli;
	});

	it("should attach GPU starter annual", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: advanceProducts.gpuStarterAnnual.id,
		});

		const res = await AutumnCli.getCustomer(customerId);
		compareMainProduct({
			sent: advanceProducts.gpuStarterAnnual,
			cusRes: res,
		});

		expect(res!.invoices.length).to.equal(1);
	});

	it("should send 20 events and have correct balance", async () => {
		const eventCount = 20;
		const { creditsUsed } = await sendGPUEvents({
			customerId,
			eventCount,
		});

		totalCreditsUsed = creditsUsed;
		await checkCreditBalance({
			customerId,
			featureId: creditSystems.gpuCredits.id,
			totalCreditsUsed,
			originalAllowance:
				advanceProducts.gpuStarterAnnual.entitlements.gpuCredits.allowance!,
		});
	});

	it("should have invoice after a month and correct balance", async () => {
		await advanceClockForInvoice({
			stripeCli,
			testClockId,
			waitForMeterUpdate: true,
		});

		const res = await AutumnCli.getCustomer(customerId);
		const invoices = res!.invoices;

		const invoiceIndex = invoices.findIndex((invoice: any) =>
			invoice.product_ids.includes(advanceProducts.gpuStarterAnnual.id),
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
});

// // Advance by 1 year and check if latest invoice is correct
// it.skip("should have correct invoice after 1 year", async function () {
//   const stripeCli = createStripeCli({ org: this.org, env: this.env });

//   // 1. Advance by 11 months
//   let numberOfMonths = 11;
//   await advanceMonths({
//     stripeCli,
//     testClockId,
//     numberOfMonths,
//   });

//   // 2. Send 20 events
//   let eventCount = 20;
//   const { creditsUsed } = await sendGPUEvents({
//     customerId,
//     eventCount,
//   });

//   let totalCreditsUsed = creditsUsed;
//   console.log("   - Total credits used: ", totalCreditsUsed);

//   // Advance by a month and check for usage
//   await advanceClockForInvoice({
//     stripeCli,
//     testClockId,
//     waitForMeterUpdate: true,
//     startingFrom: addMonths(new Date(), numberOfMonths),
//   });

//   const res = await AutumnCli.getCustomer(customerId);
//   const invoices = res!.invoices;

//   let usagePrice = await getUsageInArrearPrice({
//     org: this.org,
//     env: this.env,
//     productId: advanceProducts.gpuStarterAnnual.id,
//   });

//   // Get billing meter event summary
//   let eventSummary = await checkBillingMeterEventSummary({
//     stripeCli,
//     startTime: addMonths(new Date(), 11),
//     stripeMeterId: usagePrice?.config?.stripe_meter_id,
//     stripeCustomerId: customer.processor.id,
//   });

//   try {
//     assert.exists(eventSummary);
//     assert.equal(
//       eventSummary?.aggregated_value,
//       Math.round(totalCreditsUsed),
//     );
//     assert.equal(invoices.length, 13 + 2);
//   } catch (error) {
//     console.group();
//     console.log("   - Event summary: ", eventSummary);
//     console.log("   - Total credits used: ", totalCreditsUsed);
//     console.log("   - Last 3 invoices: ", invoices.slice(-3));
//     console.groupEnd();
//     throw error;
//   }
// });
