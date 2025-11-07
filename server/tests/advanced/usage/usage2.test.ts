import { beforeAll, describe, expect, test } from "bun:test";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import { advanceClockForInvoice } from "tests/utils/stripeUtils.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { AutumnCli } from "../../cli/AutumnCli.js";
import { advanceProducts, creditSystems, features } from "../../global.js";
import { getCreditsUsed } from "../../utils/advancedUsageUtils.js";
import { expectCustomerV0Correct } from "tests/utils/expectUtils/expectCustomerV0Correct.js";
import { timeout } from "../../utils/genUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";

// NOTE: This test uses GPU products from global.ts (advanceProducts.gpuSystemStarter)
// These products are not yet converted to ProductV2 format in sharedProducts.ts
// The test has been migrated to Bun but still uses ProductV1 from global.ts

const testCase = "usage2";
describe(`${chalk.yellowBright("usage2: Testing basic usage product")}`, () => {
	const customerId = testCase;
	const PRECISION = 10;
	const ASSERT_INVOICE_AMOUNT = true;
	const CREDIT_MULTIPLIER = 100000;

	let testClockId = "";
	let totalCreditsUsed = 0;

	let stripeCli: Stripe;

	beforeAll(async () => {
		const { testClockId: createdTestClockId } = await initCustomerV3({
			ctx,
			customerId,
			customerData: { fingerprint: "test" },
			withTestClock: true,
			attachPm: "success",
		});

		testClockId = createdTestClockId;

		stripeCli = ctx.stripeCli;
	});

	test("should attach gpu system starter", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: advanceProducts.gpuSystemStarter.id,
		});

		const res = await AutumnCli.getCustomer(customerId);
		expectCustomerV0Correct({
			sent: advanceProducts.gpuSystemStarter,
			cusRes: res,
			ctx,
		});
	});

	// Use up events
	test("should send events and have correct balance (up to 10 DP)", async () => {
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

		expect(allowed).toBe(true);
		expect(balanceObj!.balance).toBe(
			new Decimal(creditAllowance).minus(totalCreditsUsed).toNumber(),
		);
	});

	// Check invoice.created event
	test("should have correct invoice amount / updated meter balance", async () => {
		await advanceClockForInvoice({
			stripeCli,
			testClockId,
			waitForMeterUpdate: ASSERT_INVOICE_AMOUNT,
		});
	});
});
