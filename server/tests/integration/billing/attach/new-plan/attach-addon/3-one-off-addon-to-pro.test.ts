/**
 * Attach Add-on Tests (Attach V2)
 *
 * Tests for attaching add-on products to customers.
 * Add-ons are additive - they never expire/cancel existing products.
 *
 * Key behaviors:
 * - Add-ons are always attached (never replace existing products)
 * - Features from add-ons combine with main product features
 * - Re-attaching same add-on creates separate customer_product records
 * - Multiple different add-ons can coexist
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: One-off add-on to Pro customer
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on Pro ($20/mo) with 100 messages
 * - Attach one-off add-on with prepaid words ($10 base + $5/50 words)
 *
 * Expected:
 * - Both Pro and add-on active
 * - Invoice for add-on ($15)
 */
test.concurrent(
	`${chalk.yellowBright("addon 3: one-off addon to pro")}`,
	async () => {
		const customerId = "addon-oneoff-to-pro";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({ id: "pro", items: [messagesItem] });

		const oneOffWordsItem = items.oneOffWords({
			includedUsage: 0,
			billingUnits: 50,
			price: 5,
		});
		const oneOffAddon = products.oneOffAddOn({
			id: "oneoff-addon",
			items: [oneOffWordsItem],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, oneOffAddon] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		// Preview add-on - $10 base + $5 for 50 words = $15
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: oneOffAddon.id,
			options: [{ feature_id: TestFeature.Words, quantity: 50 }],
		});
		expect(preview.total).toBe(15);

		// Attach one-off add-on
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: oneOffAddon.id,
			options: [{ feature_id: TestFeature.Words, quantity: 50 }],
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Both products active
		await expectCustomerProducts({
			customer,
			active: [pro.id, oneOffAddon.id],
		});

		// Messages from Pro
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});

		// Words from one-off add-on
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Words,
			balance: 50,
			usage: 0,
		});

		// 2 invoices: Pro ($20) + add-on ($15)
		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: 15,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
