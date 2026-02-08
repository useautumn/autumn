/**
 * V2 Attach → V1 Downgrade Compatibility Tests
 *
 * Tests that verify V1's attach() works correctly to DOWNGRADE a customer
 * who was initially attached via V2 billing. Downgrade scenarios include:
 * 1. Product downgrade (premium → pro with different prepaid configuration)
 * 2. Same product with decreased prepaid price
 *
 * V2 attach:
 * - Uses s.billing.attach()
 * - quantity = total units INCLUDING allowance
 *
 * V1 downgrade attach:
 * - Uses autumnV1.attach()
 * - quantity = packs * billingUnits (EXCLUDING allowance)
 *
 * Note: On product downgrade, usage resets and balance is recalculated.
 *
 * Test flow:
 * 1. Use s.billing.attach() for initial V2 attach
 * 2. Use autumnV1.attach() for V1 product downgrade
 */

import { test } from "bun:test";
import { type ApiCustomerV3, OnDecrease, OnIncrease } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: PRODUCT DOWNGRADE (Premium → Pro) - Same quantity
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("v2→v1 downgrade: product downgrade (premium → pro) same quantity")}`, async () => {
	const customerId = "v2-v1-downgrade-product";
	const billingUnits = 100;

	// Premium: $15/pack, $50 base, 200 included usage
	const premiumIncludedUsage = 200;
	const premiumPricePerPack = 15;
	const premiumPrepaidItem = items.prepaidMessages({
		includedUsage: premiumIncludedUsage,
		billingUnits,
		price: premiumPricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});
	const premiumPriceItem = items.monthlyPrice({ price: 50 });
	const premium = products.base({
		id: "premium",
		items: [premiumPrepaidItem, premiumPriceItem],
	});

	// Pro: $10/pack, $20 base, 100 included usage
	const proIncludedUsage = 100;
	const proPricePerPack = 10;
	const proPrepaidItem = items.prepaidMessages({
		includedUsage: proIncludedUsage,
		billingUnits,
		price: proPricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});
	const proPriceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [proPrepaidItem, proPriceItem],
	});

	// Initial: 700 total units on Premium (including 200 allowance)
	// = 500 prepaid units = 5 packs
	const initialTotalUnits = 700;

	const { autumnV1, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			// V2 attach to Premium
			s.billing.attach({
				productId: premium.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialTotalUnits },
				],
				timeout: 4000,
			}),
		],
	});

	// Verify initial state on Premium
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Messages,
		includedUsage: initialTotalUnits,
		balance: initialTotalUnits,
		usage: 0,
	});

	// Downgrade, only consider billing units, so 5 paid packs attached

	// V1 attach to Pro (quantity excluding allowance)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify customer downgraded to Pro
	// On product change, usage resets and balance is recalculated
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 600,
		balance: 600,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Verify invoice: should have downgrade credits
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 20 + proPricePerPack * 5,
	});
});
