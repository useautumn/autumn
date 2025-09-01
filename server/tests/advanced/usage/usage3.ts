import { expect } from "chai";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { getSubsFromCusId } from "tests/utils/expectUtils/expectSubUtils.js";
import { checkSubscriptionContainsProducts } from "tests/utils/scheduleCheckUtils.js";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { calculateProrationAmount } from "@/internal/invoices/prorationUtils.js";
import { priceToInvoiceAmount } from "@/internal/products/prices/priceUtils/priceToInvoiceAmount.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { AutumnCli } from "../../cli/AutumnCli.js";
import { advanceProducts } from "../../global.js";
import { sendGPUEvents } from "../../utils/advancedUsageUtils.js";
import { compareMainProduct } from "../../utils/compare.js";
import { advanceTestClock } from "../../utils/stripeUtils.js";

const _testCase = "usage3";
const _ASSERT_INVOICE_AMOUNT = true;

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
		const { testClockId: insertedTestClockId } = await initCustomer({
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
	it("usage3: should attach GPU starter monthly", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: advanceProducts.gpuSystemStarter.id,
		});
	});

	// 2. Send 20 events
	it("usage3: should send 20 events", async () => {
		const eventCount = 20;
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

		const subscriptionId = res.products[0].subscription_ids?.[0]!;
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
		const invoices = res?.invoices;

		const basePrice1 = advanceProducts.gpuSystemStarter.prices[0].config.amount;
		const basePrice2 = advanceProducts.gpuSystemPro.prices[0].config.amount;

		const { subs } = await getSubsFromCusId({
			db: this.db,
			org: this.org,
			env: this.env,
			customerId,
			stripeCli,
			productId: advanceProducts.gpuSystemPro.id,
		});

		const sub = subs[0];

		const { start, end } = subToPeriodStartEnd({ sub });
		const baseDiff = calculateProrationAmount({
			periodStart: start * 1000,
			periodEnd: end * 1000,
			now: curUnix,
			amount: basePrice2 - basePrice1,
			allowNegative: true,
		});

		const usagePrice = advanceProducts.gpuSystemStarter.prices[1];
		const overage =
			totalCreditsUsed -
			advanceProducts.gpuSystemStarter.entitlements.gpuCredits.allowance!;

		const overagePrice = priceToInvoiceAmount({
			price: usagePrice,
			overage,
		});

		const calculatedTotal = new Decimal(baseDiff)
			.plus(overagePrice)
			.toDecimalPlaces(2)
			.toNumber();

		expect(invoices[0].total).to.equal(calculatedTotal);
	});
});
