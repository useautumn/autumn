import { beforeAll, describe, expect, test } from "bun:test";
import {
	BillingInterval,
	ProductItemInterval,
	UsageModel,
} from "@autumn/shared";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectCustomerV0Correct } from "@tests/utils/expectUtils/expectCustomerV0Correct.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils.js";
import { convertProductV2ToV1 } from "@/internal/products/productUtils/productV2Utils/convertProductV2ToV1.js";
import { constructRawProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { getCreditCost } from "../../../src/internal/features/creditSystemUtils.js";
import { AutumnCli } from "../../cli/AutumnCli.js";
import {
	checkCreditBalance,
	checkUsageInvoiceAmountV2,
} from "../../utils/advancedUsageUtils.js";
import { advanceClockForInvoice } from "../../utils/stripeUtils.js";

const testCase = "usage4";

// Find credit system feature from test context
const creditsFeature = ctx.features.find((f) => f.id === TestFeature.Credits);

if (!creditsFeature) {
	throw new Error("Credits feature not found in test context");
}

const gpuStarterAnnual = constructRawProduct({
	id: "gpu-starter-annual",
	items: [
		constructPriceItem({
			price: 200, // $200/year
			interval: BillingInterval.Year,
		}),
		{
			feature_id: TestFeature.Credits,
			usage_model: UsageModel.PayPerUse,
			included_usage: 500,
			interval: ProductItemInterval.Month,
			billing_units: 1,
			price: 0.01,
			reset_usage_when_enabled: true,
		},
	],
});

describe(`${chalk.yellowBright("usage4: GPU starter annual")}`, () => {
	const customerId = testCase;
	const PRECISION = 10;
	const CREDIT_MULTIPLIER = 100000;
	let totalCreditsUsed = 0;

	let testClockId = "";
	let stripeCli: Stripe;

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [gpuStarterAnnual],
			prefix: testCase,
			customerId,
		});

		const res = await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
			attachPm: "success",
		});

		testClockId = res.testClockId;
		stripeCli = ctx.stripeCli;
	});

	test("should attach GPU starter annual", async () => {
		await AutumnCli.attach({
			customerId: customerId,
			productId: gpuStarterAnnual.id,
		});

		const res = await AutumnCli.getCustomer(customerId);
		await expectCustomerV0Correct({
			sent: gpuStarterAnnual,
			cusRes: res,
		});

		expect(res!.invoices.length).toBe(1);
	});

	test("should send 20 events and have correct balance", async () => {
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
		await new Promise((resolve) => setTimeout(resolve, 15000));

		// Convert V2 product to V1 to get allowance
		const productV1 = convertProductV2ToV1({
			productV2: gpuStarterAnnual,
			orgId: ctx.org.id,
			features: ctx.features,
		});

		const originalAllowance = Object.values(productV1.entitlements).find(
			(ent: any) => ent.feature_id === TestFeature.Credits,
		)?.allowance!;

		await checkCreditBalance({
			customerId,
			featureId: TestFeature.Credits,
			totalCreditsUsed,
			originalAllowance,
		});
	});

	test("should have invoice after a month and correct balance", async () => {
		await advanceClockForInvoice({
			stripeCli,
			testClockId,
			waitForMeterUpdate: true,
		});

		// await advanceTestClock({
		// 	stripeCli,
		// 	testClockId,
		// 	advanceTo: addHours(
		// 		addMonths(new Date(), 1),
		// 		hoursToFinalizeInvoice,
		// 	).getTime(),
		// });

		const res = await AutumnCli.getCustomer(customerId);
		const invoices = res!.invoices;

		const invoiceIndex = invoices.findIndex((invoice: any) =>
			invoice.product_ids.includes(gpuStarterAnnual.id),
		);

		await checkUsageInvoiceAmountV2({
			invoices,
			totalUsage: totalCreditsUsed,
			product: gpuStarterAnnual,
			featureId: TestFeature.Credits,
			invoiceIndex,
			includeBase: false,
		});

		// Convert V2 product to V1 to get allowance
		const productV1 = convertProductV2ToV1({
			productV2: gpuStarterAnnual,
			orgId: ctx.org.id,
			features: ctx.features,
		});

		const originalAllowance = Object.values(productV1.entitlements).find(
			(ent: any) => ent.feature_id === TestFeature.Credits,
		)?.allowance!;

		await checkCreditBalance({
			customerId,
			featureId: TestFeature.Credits,
			totalCreditsUsed: 0,
			originalAllowance,
		});
	});
});
