import type { Customer } from "@autumn/shared";
import { beforeAll, describe, expect, test } from "bun:test";
import chalk from "chalk";
import type Stripe from "stripe";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { AutumnCli } from "../../cli/AutumnCli.js";
import { advanceProducts, creditSystems } from "../../global.js";
import {
	checkCreditBalance,
	checkUsageInvoiceAmount,
	sendGPUEvents,
} from "../../utils/advancedUsageUtils.js";
import { expectCustomerV0Correct } from "tests/utils/expectUtils/expectCustomerV0Correct.js";
import { advanceClockForInvoice } from "../../utils/stripeUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";

// NOTE: This test uses GPU products from global.ts (advanceProducts.gpuStarterAnnual)
// These products are not yet converted to ProductV2 format in sharedProducts.ts
// The test has been migrated to Bun but still uses ProductV1 from global.ts
// However, it does use checkUsageInvoiceAmountV2 for the V2 helper function

const testCase = "usage4";

describe(`${chalk.yellowBright("usage4: GPU starter annual")}`, () => {
	const customerId = testCase;
	let totalCreditsUsed = 0;

	let testClockId = "";
	let customer: Customer;
	let stripeCli: Stripe;

	beforeAll(async () => {
		const res = await initCustomerV3({
			ctx,
			customerId,
			customerData: { fingerprint: "test" },
			withTestClock: true,
			attachPm: "success",
		});

		testClockId = res.testClockId;
		customer = res.customer;
		stripeCli = ctx.stripeCli;
	});

	test("should attach GPU starter annual", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: advanceProducts.gpuStarterAnnual.id,
		});

		const res = await AutumnCli.getCustomer(customerId);
		expectCustomerV0Correct({
			sent: advanceProducts.gpuStarterAnnual,
			cusRes: res,
			ctx,
		});

		expect(res!.invoices.length).toBe(1);
	});

	test("should send 20 events and have correct balance", async () => {
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

	test("should have invoice after a month and correct balance", async () => {
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

		// NOTE: Using checkUsageInvoiceAmount (V1) as gpuStarterAnnual is not yet converted to V2
		// When GPU products are migrated to ProductV2, this should use checkUsageInvoiceAmountV2
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
