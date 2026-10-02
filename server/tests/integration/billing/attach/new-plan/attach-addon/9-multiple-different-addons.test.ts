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

import { test } from "bun:test";
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
// TEST 9: Multiple different add-ons
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer on Pro ($20/mo) with 100 messages
 * - Attach recurring add-on ($20/mo) with 200 words
 * - Attach one-off add-on ($10 base) with 50 storage
 *
 * Expected:
 * - All 3 products active
 * - Combined features from all products
 */
test.concurrent(
	`${chalk.yellowBright("addon 9: multiple different addons")}`,
	async () => {
		const customerId = "addon-multiple-different";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({ id: "pro", items: [messagesItem] });

		const wordsItem = items.monthlyWords({ includedUsage: 200 });
		const recurringAddon = products.recurringAddOn({
			id: "recurring-addon",
			items: [wordsItem],
		});

		const oneOffStorageItem = items.oneOffStorage({
			includedUsage: 0,
			billingUnits: 50,
			price: 5,
		});
		const oneOffAddon = products.oneOffAddOn({
			id: "oneoff-addon",
			items: [oneOffStorageItem],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, recurringAddon, oneOffAddon] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		// Attach recurring add-on ($20/mo)
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: recurringAddon.id,
			redirect_mode: "if_required",
		});

		// Attach one-off add-on ($10 base + $5 for 50 storage = $15)
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: oneOffAddon.id,
			options: [{ feature_id: TestFeature.Storage, quantity: 50 }],
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// All 3 products active
		await expectCustomerProducts({
			customer,
			active: [pro.id, recurringAddon.id, oneOffAddon.id],
		});

		// Messages from Pro
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});

		// Words from recurring add-on
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Words,
			includedUsage: 200,
			balance: 200,
			usage: 0,
		});

		// Storage from one-off add-on
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Storage,
			balance: 50,
			usage: 0,
		});

		// 3 invoices: Pro ($20) + recurring add-on ($20) + one-off add-on ($15)
		await expectCustomerInvoiceCorrect({
			customer,
			count: 3,
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
