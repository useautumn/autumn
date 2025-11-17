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
import { getSubsFromCusId } from "@tests/utils/expectUtils/expectSubUtils.js";
import { checkSubscriptionContainsProducts } from "@tests/utils/scheduleCheckUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { v1ProductToBasePrice } from "@tests/utils/testProductUtils/testProductUtils.js";
import { subToPeriodStartEnd } from "@/external/stripe/stripeSubUtils/convertSubUtils.js";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";
import { calculateProrationAmount } from "@/internal/invoices/prorationUtils.js";
import { priceToInvoiceAmount } from "@/internal/products/prices/priceUtils/priceToInvoiceAmount.js";
import { constructPriceItem } from "@/internal/products/product-items/productItemUtils.js";
import { convertProductV2ToV1 } from "@/internal/products/productUtils/productV2Utils/convertProductV2ToV1.js";
import { constructRawProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0.js";
import { AutumnCli } from "../../cli/AutumnCli.js";
import { advanceTestClock } from "../../utils/stripeUtils.js";

const testCase = "usage3";
const PRECISION = 10;
const CREDIT_MULTIPLIER = 100000;

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

const gpuSystemPro = constructRawProduct({
	id: "gpu-system-pro",
	items: [
		constructPriceItem({
			price: 100, // $100/month
			interval: BillingInterval.Month,
		}),
		{
			feature_id: TestFeature.Credits,
			usage_model: UsageModel.PayPerUse,
			included_usage: 5000,
			interval: ProductItemInterval.Month,
			billing_units: 1,
			price: 0.01,
			reset_usage_when_enabled: true,
		},
	],
});

describe(`${chalk.yellowBright(
	"usage3: upgrade from GPU starter monthly to GPU pro monthly",
)}`, () => {
	const customerId = testCase;
	let testClockId = "";
	let totalCreditsUsed = 0;
	let stripeCli: Stripe;
	let curUnix = 0;

	beforeAll(async () => {
		await initProductsV0({
			ctx,
			products: [gpuSystemStarter, gpuSystemPro],
			prefix: testCase,
			customerId,
		});

		const { testClockId: insertedTestClockId } = await initCustomerV3({
			ctx,
			customerId,
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
			productId: gpuSystemStarter.id,
		});
	});

	// 2. Send 20 events
	test("usage3: should send 20 events", async () => {
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
			productId: gpuSystemPro.id,
		});

		// MAKE SURE STRIPE SUB ONLY HAS GPU PRO

		const res = await AutumnCli.getCustomer(customerId);
		await expectCustomerV0Correct({
			sent: gpuSystemPro,
			cusRes: res,
		});

		const subscriptionId = res.products[0].subscription_ids![0]!;
		await checkSubscriptionContainsProducts({
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			subscriptionId,
			productIds: [gpuSystemPro.id],
		});
	});

	// 4. Check invoice for 15 days of starter usage
	test("should have invoice for 15 days of starter usage", async () => {
		const res = await AutumnCli.getCustomer(customerId);
		const invoices = res!.invoices;

		// Convert V2 products to V1 to access prices
		const starterV1 = convertProductV2ToV1({
			productV2: gpuSystemStarter,
			orgId: ctx.org.id,
			features: ctx.features,
		});

		const proV1 = convertProductV2ToV1({
			productV2: gpuSystemPro,
			orgId: ctx.org.id,
			features: ctx.features,
		});

		const basePrice1 = v1ProductToBasePrice({ prices: starterV1.prices });
		const basePrice2 = v1ProductToBasePrice({ prices: proV1.prices });

		const { subs } = await getSubsFromCusId({
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			customerId,
			stripeCli,
			productId: gpuSystemPro.id,
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

		const usagePrice = starterV1.prices[1];
		const starterAllowance =
			starterV1.entitlements[TestFeature.Credits]?.allowance!;
		const overage = totalCreditsUsed - starterAllowance;

		const overagePrice = priceToInvoiceAmount({
			price: usagePrice,
			overage,
		});

		const calculatedTotal = new Decimal(baseDiff)
			.plus(overagePrice)
			.toDecimalPlaces(2)
			.toNumber();

		expect(invoices[0].total).toBe(calculatedTotal);
	});
});
