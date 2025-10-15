import { expect } from "chai";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import { setupBefore } from "tests/before.js";
import { advanceClockForInvoice } from "tests/utils/stripeUtils.js";
import { initCustomer } from "@/utils/scriptUtils/initCustomer.js";
import { AutumnCli } from "../../cli/AutumnCli.js";
import { advanceProducts, creditSystems, features } from "../../global.js";
import { getCreditsUsed } from "../../utils/advancedUsageUtils.js";
import { compareMainProduct } from "../../utils/compare.js";
import { timeout } from "../../utils/genUtils.js";

// FIRST, REGULAR CHECK GPU STARTER MONTHLY

const testCase = "usage2";
describe(`${chalk.yellowBright("usage2: Testing basic usage product")}`, () => {
	const customerId = testCase;
	const PRECISION = 10;
	const ASSERT_INVOICE_AMOUNT = true;
	const CREDIT_MULTIPLIER = 100000;

	let testClockId = "";
	let totalCreditsUsed = 0;

	let stripeCli: Stripe;

	before(async function () {
		await setupBefore(this);
		const { testClockId: createdTestClockId } = await initCustomer({
			customerId,
			org: this.org,
			env: this.env,
			db: this.db,
			autumn: this.autumnJs,
			attachPm: "success",
		});

		testClockId = createdTestClockId;

		stripeCli = this.stripeCli;
	});

	it("should attach gpu system starter", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: advanceProducts.gpuSystemStarter.id,
		});

		const res = await AutumnCli.getCustomer(customerId);
		compareMainProduct({
			sent: advanceProducts.gpuSystemStarter,
			cusRes: res,
		});
	});

	// Use up events
	it("should send events and have correct balance (up to 10 DP)", async () => {
		const eventCount = 20;

		const batchEvents = [];
		for (let i = 0; i < eventCount; i++) {
			const randomVal = new Decimal(Math.random().toFixed(PRECISION))
				.mul(CREDIT_MULTIPLIER)
				.mul(Math.random() > 0.2 ? 1 : -1)
				.toNumber();
			const gpuId = i % 2 === 0 ? features.gpu1.id : features.gpu2.id;

			const creditsUsed = getCreditsUsed(
				creditSystems.gpuCredits,
				gpuId,
				randomVal,
			);

			totalCreditsUsed = new Decimal(totalCreditsUsed)
				.plus(creditsUsed)
				.toNumber();

			batchEvents.push(
				AutumnCli.sendEvent({
					customerId: customerId,
					eventName: gpuId,
					properties: { value: randomVal },
				}),
			);
		}

		await Promise.all(batchEvents);

		await timeout(10000);

		const { allowed, balanceObj }: any = await AutumnCli.entitled(
			customerId,
			creditSystems.gpuCredits.id,
			true,
		);

		const creditAllowance =
			advanceProducts.gpuSystemStarter.entitlements.gpuCredits.allowance!;

		expect(allowed).to.be.true;
		expect(balanceObj!.balance).to.equal(
			new Decimal(creditAllowance).minus(totalCreditsUsed).toNumber(),
		);
		// console.log("   - Total credits used: ", totalCreditsUsed);
		// console.log("   - Balance: ", balanceObj!.balance);
	});

	// Check invoice.created event
	it("should have correct invoice amount / updated meter balance", async () => {
		await advanceClockForInvoice({
			stripeCli,
			testClockId,
			waitForMeterUpdate: ASSERT_INVOICE_AMOUNT,
		});
		// const res = await AutumnCli.getCustomer(customerId);
		// const invoices = res!.invoices;
		// if (ASSERT_INVOICE_AMOUNT) {
		// 	await checkUsageInvoiceAmount({
		// 		invoices,
		// 		totalUsage: totalCreditsUsed,
		// 		product: advanceProducts.gpuSystemStarter,
		// 		featureId: creditSystems.gpuCredits.id,
		// 	});
		// } else {
		// 	const { allowed, balanceObj }: any = await AutumnCli.entitled(
		// 		customerId,
		// 		creditSystems.gpuCredits.id,
		// 		true,
		// 	);
		// 	const allowance =
		// 		advanceProducts.gpuSystemStarter.entitlements.gpuCredits.allowance!;
		// 	assert.equal(balanceObj.balance, allowance);
		// }
	});
});
