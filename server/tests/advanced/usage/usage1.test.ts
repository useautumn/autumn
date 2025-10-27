import type { Customer } from "@autumn/shared";
import { beforeAll, describe, expect, test } from "bun:test";
import chalk from "chalk";
import type Stripe from "stripe";
import { v1ProductToBasePrice } from "tests/utils/testProductUtils/testProductUtils.js";
import { calculateMetered1Price } from "@/external/stripe/utils.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { AutumnCli } from "../../cli/AutumnCli.js";
import { TestFeature } from "tests/setup/v2Features.js";
import { expectCustomerV0Correct } from "tests/utils/expectUtils/expectCustomerV0Correct.js";
import { timeout } from "../../utils/genUtils.js";
import { advanceClockForInvoice } from "../../utils/stripeUtils.js";
import { sharedProWithOverage } from "./sharedProducts.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { convertProductV2ToV1 } from "@/internal/products/productUtils/productV2Utils/convertProductV2ToV1.js";

const testCase = "usage1";

describe(`${chalk.yellowBright("usage1: Testing basic usage product")}`, () => {
	const NUM_EVENTS = 50;
	const customerId = testCase;
	let testClockId: string;
	let customer: Customer;
	let stripeCli: Stripe;

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;

		const { customer: customer_, testClockId: testClockId_ } =
			await initCustomerV3({
				ctx,
				customerId,
				customerData: { fingerprint: "test" },
				withTestClock: true,
				attachPm: "success",
			});

		customer = customer_;
		testClockId = testClockId_;
	});

	test("should attach usage based product", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: sharedProWithOverage.id,
		});

		const res = await AutumnCli.getCustomer(customerId);

		expectCustomerV0Correct({
			sent: sharedProWithOverage,
			cusRes: res,
			ctx,
		});
	});

	test("usage1: should send metered1 events", async () => {
		const batchUpdates = [];
		for (let i = 0; i < NUM_EVENTS; i++) {
			batchUpdates.push(
				AutumnCli.sendEvent({
					customerId: customerId,
					eventName: TestFeature.Messages,
				}),
			);
		}

		await Promise.all(batchUpdates);
		await timeout(25000);
	});

	test("should have correct metered1 balance after sending events", async () => {
		const res: any = await AutumnCli.entitled(customerId, TestFeature.Messages);

		expect(res!.allowed).toBe(true);

		const balance = res!.balances.find(
			(balance: any) => balance.feature_id === TestFeature.Messages,
		);

		// Convert V2 product to V1 to access entitlements
		const productV1 = convertProductV2ToV1({
			productV2: sharedProWithOverage,
			orgId: ctx.org.id,
			features: ctx.features,
		});

		const proOverageAmt =
			productV1.entitlements.messages.allowance;

		expect(res!.allowed, "should be allowed").toBe(true);

		expect(balance?.balance, "should have correct metered1 balance").toBe(
			proOverageAmt! - NUM_EVENTS,
		);

		expect(balance?.usage_allowed, "should have usage_allowed").toBe(true);
	});

	// Check invoice
	test("should advance stripe test clock and wait for event", async () => {
		await advanceClockForInvoice({
			stripeCli,
			testClockId,
			waitForMeterUpdate: true,
		});
	});

	test("should have correct invoice amount", async () => {
		const cusRes = await AutumnCli.getCustomer(customerId);
		const invoices = cusRes!.invoices;

		// Convert V2 product to V1 for price calculations
		const productV1 = convertProductV2ToV1({
			productV2: sharedProWithOverage,
			orgId: ctx.org.id,
			features: ctx.features,
		});

		// calculate price
		const price = calculateMetered1Price({
			product: productV1,
			numEvents: NUM_EVENTS,
			metered1Feature: ctx.features[TestFeature.Messages],
		});

		expect(invoices.length).toBe(2);

		const invoice = invoices[0];

		const basePrice = v1ProductToBasePrice({
			prices: productV1.prices,
		});

		expect(invoice.total, "invoice total should be usage price + base price").toBe(
			price + basePrice,
		);
	});
});
