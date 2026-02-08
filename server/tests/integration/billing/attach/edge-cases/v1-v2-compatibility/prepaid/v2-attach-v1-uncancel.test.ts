/**
 * V2 Attach → V1 Uncancel (Renew) Compatibility Tests
 *
 * Tests that verify V1's attach() correctly renews/uncancels a product
 * that was initially attached via V2 billing and then canceled.
 *
 * Flow tested:
 * 1. V2 attach (s.billing.attach)
 * 2. Cancel (s.cancel)
 * 3. V1 attach to same product (autumnV1.attach) → triggers renew flow
 *
 * The renew flow is handled by handleRenewProduct.ts which:
 * - Releases any subscription schedule
 * - Uncancels the Stripe subscription (cancel_at: null)
 * - Clears canceled/ended_at in database
 *
 * V2 attach:
 * - Uses s.billing.attach()
 * - quantity = total units INCLUDING allowance
 *
 * V1 uncancel attach:
 * - Uses autumnV1.attach()
 * - quantity = packs * billingUnits (EXCLUDING allowance)
 *
 * Test flow:
 * 1. Use s.billing.attach() for initial V2 attach
 * 2. Use s.cancel() to cancel the product
 * 3. Use autumnV1.attach() for V1 renew (same product)
 */

import { test } from "bun:test";
import {
	type ApiCustomerV3,
	BillingVersion,
	OnDecrease,
	OnIncrease,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: BASIC RENEW - Same quantity
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("v2→v1 uncancel: basic renew with same quantity")}`, async () => {
	const customerId = "v2-v1-uncancel-basic";
	const billingUnits = 100;
	const includedUsage = 100;
	const pricePerPack = 10;

	const prepaidItem = items.prepaidMessages({
		includedUsage,
		billingUnits,
		price: pricePerPack,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});

	const priceItem = items.monthlyPrice({ price: 30 });
	const pro = products.base({
		id: "pro",
		items: [prepaidItem, priceItem],
	});

	// Initial: 500 total units (including 100 allowance)
	// = 400 prepaid units = 4 packs
	const initialTotalUnits = 500;

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			// V2 attach
			s.billing.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialTotalUnits },
				],
			}),
			// Cancel the product
			s.cancel({ productId: pro.id }),
		],
	});

	// Verify customer is canceled but still has access until period end
	const customerCanceled =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerCanceled,
		productId: pro.id,
	});

	// V1 attach to same product (renew flow)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	// Verify customer is renewed (no longer canceled)
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfter,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: initialTotalUnits,
		balance: initialTotalUnits,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		billingVersion: BillingVersion.V1,
	});

	// Should still have only 1 invoice (no new charge for renew)
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 1,
	});
});
