import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect.js";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Volume Pricing with flat_amount — Attach Tests
 *
 * Verifies that attaching a volume-priced prepaid product with `flat_amount`
 * charges the correct total. Volume pricing charges the entire quantity at
 * the rate of the matching tier, plus the tier's flat fee.
 *
 * billingUnits = 1 throughout so quantity maps directly to units.
 *
 * Test 1: flat_amount only (per-unit amount = 0)
 *   Tier 1: 0–100 → $0/unit + $20 flat
 *   Tier 2: 101+  → $0/unit + $50 flat
 *   Attach 50 → tier 1 → 50 × $0 + $20 = $20
 *
 * Test 2: mixed per-unit + flat_amount
 *   Tier 1: 0–100 → $1/unit + $10 flat
 *   Tier 2: 101+  → $0.50/unit + $25 flat
 *   Attach 50 → tier 1 → 50 × $1 + $10 = $60
 */

// ─── Test 1: Flat amount only (per-unit = 0) ─────────────────────────────────

test.concurrent(`${chalk.yellowBright("attach-prepaid-volume-flat: flat_amount only")}`, async () => {
	const customerId = "vol-flat-only-attach";
	const quantity = 50;

	// Tier 1: 0-100 → $0/unit, $20 flat. Tier 2: 101+ → $0/unit, $50 flat.
	// 50 units → falls in tier 1 → 50 × $0 + $20 = $20
	const expectedTotal = 20;

	const volumeItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: 1,
		tiers: [
			{ to: 100, amount: 0, flat_amount: 20 },
			{ to: "inf", amount: 0, flat_amount: 50 },
		],
	});

	const product = products.base({
		id: "vol-flat-only",
		items: [volumeItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(preview.total).toBe(expectedTotal);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: product.id });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: quantity,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ─── Test 2: Mixed per-unit amount + flat_amount ─────────────────────────────

test.concurrent(`${chalk.yellowBright("attach-prepaid-volume-flat: mixed per-unit + flat_amount")}`, async () => {
	const customerId = "vol-flat-mixed-attach";
	const quantity = 50;

	// Tier 1: 0-100 → $1/unit, $10 flat. Tier 2: 101+ → $0.50/unit, $25 flat.
	// 50 units → falls in tier 1 → 50 × $1 + $10 = $60
	const expectedTotal = 60;

	const volumeItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: 1,
		tiers: [
			{ to: 100, amount: 1, flat_amount: 10 },
			{ to: "inf", amount: 0.5, flat_amount: 25 },
		],
	});

	const product = products.base({
		id: "vol-flat-mixed",
		items: [volumeItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(preview.total).toBe(expectedTotal);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: product.id });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: quantity,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
