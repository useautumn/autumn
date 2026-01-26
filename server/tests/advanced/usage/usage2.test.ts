import { beforeAll, describe, expect, test } from "bun:test";
import {
	BillingInterval,
	ProductItemInterval,
	UsageModel,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectCustomerV0Correct } from "@tests/utils/expectUtils/expectCustomerV0Correct.js";
import { getExpectedInvoiceTotal } from "@tests/utils/expectUtils/expectInvoiceUtils.js";
import { advanceClockForInvoice } from "@tests/utils/stripeUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils.js";
import { convertProductV2ToV1 } from "@/internal/products/productUtils/productV2Utils/convertProductV2ToV1.js";
import { constructRawProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { getCreditCost } from "../../../src/internal/features/creditSystemUtils.js";
import { AutumnCli } from "../../cli/AutumnCli.js";

const testCase = "usage2";

// Find credit system feature from test context
const creditsFeature = ctx.features.find((f) => f.id === TestFeature.Credits);

if (!creditsFeature) {
	throw new Error("Credits feature not found in test context");
}

const gpuSystemStarter = constructRawProduct({
	id: "gpu-system-starter",
	items: [
		constructPriceItem({
			price: 20, // $20/month
			interval: BillingInterval.Month,
		}),
		{
			feature_id: TestFeature.Credits,
			usage_model: UsageModel.PayPerUse,
			included_usage: 500,
			interval: ProductItemInterval.Month,
			billing_units: 5,
			price: 0.01,
			reset_usage_when_enabled: true,
		},
	],
});

describe(`${chalk.yellowBright("usage2: Testing basic usage product")}`, () => {
	const customerId = testCase;
	const PRECISION = 10;
	const ASSERT_INVOICE_AMOUNT = true;
	const CREDIT_MULTIPLIER = 100000;

	let testClockId = "";
	let totalCreditsUsed = 0;

	let stripeCli: Stripe;

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [gpuSystemStarter],
			prefix: testCase,
			customerId,
		});

		const { testClockId: createdTestClockId } = await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
			attachPm: "success",
		});

		testClockId = createdTestClockId;

		stripeCli = ctx.stripeCli;
	});

	test("should attach gpu system starter", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: gpuSystemStarter.id,
		});

		const res = await AutumnCli.getCustomer(customerId);
		await expectCustomerV0Correct({
			sent: gpuSystemStarter,
			cusRes: res,
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
			const featureId = i % 2 === 0 ? TestFeature.Action1 : TestFeature.Action2;

			const creditsUsed = getCreditCost({
				creditSystem: creditsFeature,
				featureId: featureId,
				amount: randomVal,
			});

			totalCreditsUsed = new Decimal(totalCreditsUsed)
				.plus(creditsUsed)
				.toNumber();

			batchEvents.push(
				AutumnCli.sendEvent({
					customerId: customerId,
					featureId: featureId,
					properties: { value: randomVal },
				}),
			);
		}

		await Promise.all(batchEvents);

		// await timeout(10000);

		const { allowed, balanceObj }: any = await AutumnCli.entitled(
			customerId,
			TestFeature.Credits,
			true,
		);

		// Convert V2 product to V1 to get allowance
		const productV1 = convertProductV2ToV1({
			productV2: gpuSystemStarter,
			orgId: ctx.org.id,
			features: ctx.features,
		});

		const creditAllowance =
			productV1.entitlements[TestFeature.Credits]?.allowance ?? 0;

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

		const cusRes = await AutumnCli.getCustomer(customerId);
		const invoices = cusRes!.invoices;

		// Calculate expected invoice total using getExpectedInvoiceTotal
		// We need to convert credits used to the actual usage value
		// Since credits are calculated from Action1/Action2 events, we need to track the actual usage
		// For now, we'll use totalCreditsUsed as the value for the Credits feature
		const expectedTotal = await getExpectedInvoiceTotal({
			customerId,
			productId: gpuSystemStarter.id,
			usage: [
				{
					featureId: TestFeature.Credits,
					value: totalCreditsUsed,
				},
			],
			stripeCli,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
		});

		// Find the invoice that matches our product
		const invoice = invoices.find((inv: any) =>
			inv.product_ids.includes(gpuSystemStarter.id),
		);

		expect(invoice, "Invoice should exist").toBeDefined();
		expect(invoice!.total, "invoice total should match expected total").toBe(
			expectedTotal,
		);
	});
});
