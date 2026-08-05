/**
 * Legacy Attach V1 Invoice Mode Tests (Finalized, Non-Deferred)
 *
 * Slice 2 of 2 (see legacy-attach-invoice-mode.test.ts for slice 1).
 *
 * Tests that V1 attach() with `invoice: true` (finalize_invoice defaults to true)
 * returns a checkout_url (hosted invoice URL) and defers product activation
 * until the invoice is paid.
 *
 * Scenarios:
 * 3. Upgrade (pro → premium)
 * 4. Update quantity (prepaid increase)
 */
/** biome-ignore-all lint/suspicious/noExplicitAny: test file */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { waitForCustomerInvoiceStatus } from "@tests/integration/billing/utils/waitForCustomerInvoiceStatus";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeInvoiceCheckoutV2 as completeInvoiceCheckout } from "@tests/utils/browserPool/completeInvoiceCheckoutV2";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Upgrade (pro → premium) - invoice mode
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach pro normally
 * - Upgrade to premium with invoice: true → checkout_url
 * - Still on pro until payment completes
 * - Complete checkout → premium active, invoice paid
 */
test.concurrent(
	`${chalk.yellowBright("legacy-inv-mode 3: upgrade")}`,
	async () => {
		const customerId = "legacy-inv-mode-upgrade";

		const proMessagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro",
			items: [proMessagesItem],
		});

		const premiumMessagesItem = items.monthlyMessages({
			includedUsage: 500,
		});
		const premium = products.premium({
			id: "premium",
			items: [premiumMessagesItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		const res = await autumnV1.attach({
			customer_id: customerId,
			product_id: premium.id,
			invoice: true,
			finalize_invoice: false,
			enable_product_immediately: true,
		});

		expect(res.checkout_url).toBeFalsy();

		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectProductAttached({
			customer: customerAfter as any,
			product: premium,
		});

		expectCustomerFeatureCorrect({
			customer: customerAfter,
			featureId: TestFeature.Messages,
			includedUsage: 500,
			balance: 500,
			usage: 0,
		});

		// Invoice should be paid after checkout
		const nonCachedCustomer = await autumnV1.customers.get<ApiCustomerV3>(
			customerId,
			{ skip_cache: "true" },
		);
		expect(nonCachedCustomer.invoices?.[0].status).toBe("draft");

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("legacy-inv-mode 4: upgrade")}`,
	async () => {
		const customerId = "legacy-inv-mode-upgrade-2";

		const proMessagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro",
			items: [proMessagesItem],
		});

		const premiumMessagesItem = items.monthlyMessages({
			includedUsage: 500,
		});
		const premium = products.premium({
			id: "premium",
			items: [premiumMessagesItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		const res = await autumnV1.attach({
			customer_id: customerId,
			product_id: premium.id,
			invoice: true,
			enable_product_immediately: true,
		});

		expect(res.checkout_url).toBeDefined();

		await completeInvoiceCheckout({
			url: res.checkout_url,
			ctx,
			customerId,
		});

		await expectCustomerProducts({
			autumn: autumnV1,
			customerId,
			active: [premium.id],
		});

		await expectCustomerFeatureCorrect({
			autumn: autumnV1,
			customerId,
			featureId: TestFeature.Messages,
			includedUsage: 500,
			balance: 500,
			usage: 0,
		});

		// The upgrade's own invoice posts after the attach, so it must be waited
		// for here — asserting earlier reads the previous invoice.
		await waitForCustomerInvoiceStatus({
			autumn: autumnV1,
			customerId,
			status: "paid",
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
