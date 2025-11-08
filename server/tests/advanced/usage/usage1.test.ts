import { beforeAll, describe, expect, test } from "bun:test";
import {
	BillingInterval,
	Infinite,
	ProductItemInterval,
	UsageModel,
} from "@autumn/shared";
import chalk from "chalk";
import type Stripe from "stripe";
import { TestFeature } from "tests/setup/v2Features.js";
import { expectCustomerV0Correct } from "tests/utils/expectUtils/expectCustomerV0Correct.js";
import { getExpectedInvoiceTotal } from "tests/utils/expectUtils/expectInvoiceUtils.js";
import ctx from "tests/utils/testInitUtils/createTestContext.js";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils.js";
import { convertProductV2ToV1 } from "@/internal/products/productUtils/productV2Utils/convertProductV2ToV1.js";
import { constructRawProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { AutumnCli } from "../../cli/AutumnCli.js";
import { advanceClockForInvoice } from "../../utils/stripeUtils.js";

const testCase = "usage1";

const proWithOverage = constructRawProduct({
	id: "pro-with-overage",
	items: [
		constructPriceItem({
			price: 10, // $10/month (matches global.ts default for monthly price)
			interval: BillingInterval.Month,
		}),
		{
			feature_id: TestFeature.Messages,
			usage_model: UsageModel.PayPerUse,
			included_usage: 10,
			interval: ProductItemInterval.Month,
			billing_units: 10,
			tiers: [
				{
					to: 10,
					amount: 0.5, // $0.5 per unit
				},
				{
					to: Infinite,
					amount: 0.25, // $0.25 per unit
				},
			],
			reset_usage_when_enabled: true,
		},
	],
});

describe(`${chalk.yellowBright("usage1: Testing basic usage product")}`, () => {
	const NUM_EVENTS = 50;
	const customerId = testCase;

	let stripeCli: Stripe;
	let testClockId: string;

	beforeAll(async () => {
		stripeCli = ctx.stripeCli;

		await initProductsV0({
			ctx,
			products: [proWithOverage],
			prefix: testCase,
			customerId,
		});

		const { testClockId: testClockId_ } = await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
			attachPm: "success",
		});

		testClockId = testClockId_;
	});

	test("should attach usage based product", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: proWithOverage.id,
		});

		const res = await AutumnCli.getCustomer(customerId);

		await expectCustomerV0Correct({
			sent: proWithOverage,
			cusRes: res,
		});
	});

	test("usage1: should send metered1 events", async () => {
		const batchUpdates = [];
		for (let i = 0; i < NUM_EVENTS; i++) {
			batchUpdates.push(
				AutumnCli.sendEvent({
					customerId: customerId,
					featureId: TestFeature.Messages,
				}),
			);
		}

		await Promise.all(batchUpdates);
		// await timeout(25000);
	});

	test("should have correct metered1 balance after sending events", async () => {
		const res: any = await AutumnCli.entitled(customerId, TestFeature.Messages);

		expect(res!.allowed).toBe(true);

		const balance = res!.balances.find(
			(balance: any) => balance.feature_id === TestFeature.Messages,
		);

		// Convert V2 product to V1 to access entitlements
		const productV1 = convertProductV2ToV1({
			productV2: proWithOverage,
			orgId: ctx.org.id,
			features: ctx.features,
		});

		const proOverageAmt =
			productV1.entitlements[TestFeature.Messages]?.allowance;

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

		expect(invoices.length).toBe(2);

		const invoice = invoices[0];

		// Calculate expected invoice total using getExpectedInvoiceTotal
		const expectedTotal = await getExpectedInvoiceTotal({
			customerId,
			productId: proWithOverage.id,
			usage: [
				{
					featureId: TestFeature.Messages,
					value: NUM_EVENTS,
				},
			],
			stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
		});

		expect(invoice.total, "invoice total should match expected total").toBe(
			expectedTotal,
		);
	});
});
