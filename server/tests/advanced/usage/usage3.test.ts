import chalk from "chalk";
import { advanceProducts } from "../../global.js";
import { AutumnCli } from "../../cli/AutumnCli.js";
import { sendGPUEvents } from "../../utils/advancedUsageUtils.js";
import { advanceTestClock } from "../../utils/stripeUtils.js";
import { expect } from "bun:test";
import { Decimal } from "decimal.js";
import { expectCustomerV0Correct } from "tests/utils/expectUtils/expectCustomerV0Correct.js";
import { checkSubscriptionContainsProducts } from "tests/utils/scheduleCheckUtils.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { beforeAll, describe, test } from "bun:test";
import Stripe from "stripe";
import { priceToInvoiceAmount } from "@/internal/products/prices/priceUtils/priceToInvoiceAmount.js";
import { calculateProrationAmount } from "@/internal/invoices/prorationUtils.js";
import { getSubsFromCusId } from "tests/utils/expectUtils/expectSubUtils.js";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";

// NOTE: This test uses GPU products from global.ts (advanceProducts.gpuSystemStarter, gpuSystemPro)
// These products are not yet converted to ProductV2 format in sharedProducts.ts
// The test has been migrated to Bun but still uses ProductV1 from global.ts

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

	beforeAll(async () => {
		let { testClockId: insertedTestClockId } = await initCustomerV3({
			ctx,
			customerId,
			customerData: { fingerprint: "test" },
			withTestClock: true,
			attachPm: "success",
		});

		testClockId = insertedTestClockId;
		stripeCli = ctx.stripeCli;
	});

	// 1. Attach GPU starter monthly
	test("usage3: should attach GPU starter monthly", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: advanceProducts.gpuSystemStarter.id,
		});
	});

	// 2. Send 20 events
	test("usage3: should send 20 events", async () => {
		let eventCount = 20;
		const { creditsUsed } = await sendGPUEvents({
			customerId,
			eventCount,
		});

		totalCreditsUsed = creditsUsed;
	});

	// 3. Advance test clock by 15 days and upgrade
	test("should advance test clock by 15 days and upgrade to GPU pro monthly", async () => {
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
		expectCustomerV0Correct({
			sent: advanceProducts.gpuSystemPro,
			cusRes: res,
			ctx,
		});

		let subscriptionId = res.products[0].subscription_ids![0]!;
		await checkSubscriptionContainsProducts({
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			subscriptionId,
			productIds: [advanceProducts.gpuSystemPro.id],
		});
	});

	// 4. Check invoice for 15 days of starter usage
	test("should have invoice for 15 days of starter usage", async () => {
		const res = await AutumnCli.getCustomer(customerId);
		const invoices = res!.invoices;

		let basePrice1 = advanceProducts.gpuSystemStarter.prices[0].config.amount;
		let basePrice2 = advanceProducts.gpuSystemPro.prices[0].config.amount;

		let { subs } = await getSubsFromCusId({
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			customerId,
			stripeCli,
			productId: advanceProducts.gpuSystemPro.id,
		});

		let sub = subs[0];

		const { start, end } = subToPeriodStartEnd({ sub });
		let baseDiff = calculateProrationAmount({
			periodStart: start * 1000,
			periodEnd: end * 1000,
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

		expect(invoices[0].total).toBe(calculatedTotal);
	});
});
