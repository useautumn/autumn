import { expect } from "chai";
import chalk from "chalk";
import { addDays, addMonths, format } from "date-fns";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import { AutumnCli } from "tests/cli/AutumnCli.js";
import { advanceProducts, features } from "tests/global.js";
import { compareMainProduct } from "tests/utils/compare.js";
import { timeout } from "tests/utils/genUtils.js";
import { checkSubscriptionContainsProducts } from "tests/utils/scheduleCheckUtils.js";
import { advanceTestClock } from "tests/utils/stripeUtils.js";
import { initCustomerWithTestClock } from "tests/utils/testInitUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";

const advanceAPThroughBalances = async ({
	stripeSub,
	stripeCli,
	testClockId,
	customerId,
	billingUnits,
	startingFrom,
	startingBalance,
}: {
	stripeSub: Stripe.Subscription;
	stripeCli: Stripe;
	testClockId: string;
	customerId: string;
	billingUnits: number;
	startingFrom?: number;
	startingBalance?: number;
}) => {
	// 1. Get total period
	const totalPeriod =
		(stripeSub.current_period_end - stripeSub.current_period_start) * 1000;

	// 2. Get allowance
	const allowance =
		advanceProducts.proratedArrearSeats.entitlements.seats.allowance!;

	// 3. Get starting balance
	let balance = startingBalance || allowance;

	// 4. Get price per seat
	const pricePerSeat =
		advanceProducts.proratedArrearSeats.prices[1].config.usage_tiers[0].amount;

	const _skipDays = 2;
	// 5. Get accrued price
	let accruedPrice = 0;
	if (startingBalance && startingBalance < 0) {
		const proratedPrice =
			(-startingBalance *
				pricePerSeat *
				(startingFrom! - stripeSub.current_period_start * 1000)) /
			totalPeriod;

		const previouslyPaid = pricePerSeat * -startingBalance;
		const priceToPay = proratedPrice - previouslyPaid;

		accruedPrice = priceToPay;
		// accruedPrice = Math.max(accruedPrice, 0);
		console.log("   🔍 Starting balance: ", startingBalance);
		console.log("   🔍 Starting price: ", accruedPrice);
	}

	let curTime = startingFrom || stripeSub.current_period_start * 1000;
	const numberOfEvents = 2;

	console.group();
	console.group();
	for (let i = 0; i < numberOfEvents; i++) {
		const sign = balance > 0 ? 1 : Math.random() > 0.7 ? 1 : -1;

		const currentUsage = allowance - balance;

		const nextBoundary =
			Math.ceil((currentUsage + 1) / billingUnits) * billingUnits;

		const prevBoundary = nextBoundary - billingUnits;

		let valueNeeded = 0;
		if (sign > 0) {
			// Add random amount to push above next boundary
			const valueToGetToNegative = balance + 1;
			valueNeeded =
				Math.floor(Math.random() * 10) + (nextBoundary - currentUsage + 1);

			valueNeeded = Math.max(valueNeeded, valueToGetToNegative);
		} else {
			valueNeeded = -(
				Math.floor(Math.random() * 10) +
				(currentUsage - prevBoundary + 1)
			);
		}

		const newBalance = balance - valueNeeded;
		const totalUsage = allowance - newBalance;

		await AutumnCli.usage({
			customerId,
			featureId: features.seats.id,
			value: totalUsage,
		});

		await timeout(2000);

		const prevBalance = balance;
		balance = newBalance;

		// Calculate prorated price only when crossing boundary
		const newPrice = Math.max(0, -balance * pricePerSeat);
		const prevCurTime = curTime;
		curTime = addDays(curTime, 2).getTime();

		if (i === numberOfEvents - 1) {
			curTime = stripeSub.current_period_end * 1000;
		}

		const proratedPrice = new Decimal(newPrice)
			.mul(curTime - prevCurTime)
			.div(totalPeriod);
		accruedPrice = new Decimal(accruedPrice)
			.plus(proratedPrice)
			.toDecimalPlaces(2)
			.toNumber();

		console.log(`Event ${i + 1}:`);
		console.log(`  - Value added: ${valueNeeded}`);
		console.log(`  - Balance: ${prevBalance} -> ${balance}`);
		console.log(`  - Prorated price: ${proratedPrice.toFixed(2)}`);
		console.log(`  - Accrued price: ${accruedPrice.toFixed(2)}`);

		await advanceTestClock({
			stripeCli,
			testClockId,
			numberOfDays: 2,
			startingFrom: new Date(prevCurTime),
		});
	}

	console.groupEnd();
	console.groupEnd();

	// Advance test clock to end of period

	const advanceTo = addDays(addMonths(new Date(), 1), 2);
	const advanceToStart = startingFrom ? new Date(startingFrom) : new Date();

	await advanceTestClock({
		stripeCli,
		testClockId,
		// numberOfHours: hoursToFinalizeInvoice,
		numberOfDays: 2,
		startingFrom: addMonths(advanceToStart, 1),
	});

	// Check invoice amount
	const res = await AutumnCli.getCustomer(customerId);
	const invoice = res.invoices[0];

	const basePrice = advanceProducts.proratedArrearSeats.prices[0].config.amount;
	const nextMonthUsagePrice = Math.max(-balance * pricePerSeat, 0);

	const expectedInvoiceTotal = Number(
		(accruedPrice + basePrice + nextMonthUsagePrice).toFixed(2),
	);
	console.log(
		`Invoice total = ${accruedPrice} (Accrued) + ${nextMonthUsagePrice} (Next month usage) + ${basePrice} (Base) = ${expectedInvoiceTotal}`,
	);

	expect(expectedInvoiceTotal).to.lte(
		new Decimal(invoice.total).plus(0.01).toNumber(),
	);
	expect(expectedInvoiceTotal).to.gte(
		new Decimal(invoice.total).minus(0.01).toNumber(),
	);

	return {
		balance,
		advancedTo: advanceTo.getTime(),
	};
};

describe(`${chalk.yellowBright(
	"arrear_prorated3: Testing through /usage",
)}`, () => {
	const customerId = "arrear_prorated3";

	let testClockId = "";
	let stripeCli: Stripe;
	let subId = "";
	let stripeSub: Stripe.Subscription;
	const billingUnits =
		advanceProducts.proratedArrearSeats.prices[1].config.billing_units || 1;

	before(async function () {
		const { testClockId: createdTestClockId } = await initCustomerWithTestClock(
			{
				customerId,
				org: this.org,
				env: this.env,
				db: this.db,
			},
		);

		stripeCli = createStripeCli({
			org: this.org,
			env: this.env,
		});

		testClockId = createdTestClockId;
	});

	it("arrear_prorated3: should attach in arrear prorated seats", async () => {
		await AutumnCli.attach({
			customerId,
			productId: advanceProducts.proratedArrearSeats.id,
		});
	});

	it("arrear_prorated3: should have correct product", async function () {
		const res = await AutumnCli.getCustomer(customerId);
		compareMainProduct({
			sent: advanceProducts.proratedArrearSeats,
			cusRes: res,
		});

		// 2. Get subscription period start and period end
		subId = res.products[0].subscription_ids[0];
		stripeSub = await stripeCli.subscriptions.retrieve(subId);

		await checkSubscriptionContainsProducts({
			db: this.db,
			org: this.org,
			env: this.env,
			subscriptionId: subId,
			productIds: [advanceProducts.proratedArrearSeats.id],
		});
	});

	let advancedTo: number;
	let balance: number;
	it("arrear_prorated3: should run first cycles and have correct invoice / balance", async () => {
		// Do it again
		const { advancedTo: advancedTo1, balance: balance1 } =
			await advanceAPThroughBalances({
				stripeSub,
				stripeCli,
				testClockId,
				customerId,
				billingUnits,
			});

		advancedTo = advancedTo1;
		balance = balance1;
	});

	it("arrear_prorated3: should run second cycle and have correct invoice / balance", async () => {
		if (advancedTo) {
			console.log(
				`   Advanced to ${format(new Date(advancedTo), "yyyy-MM-dd")}`,
			);
		}

		const newStripeSub = await stripeCli.subscriptions.retrieve(subId);
		await advanceAPThroughBalances({
			stripeSub: newStripeSub,
			stripeCli,
			testClockId,
			customerId,
			billingUnits,
			startingFrom: advancedTo,
			startingBalance: balance,
		});
	});
});
