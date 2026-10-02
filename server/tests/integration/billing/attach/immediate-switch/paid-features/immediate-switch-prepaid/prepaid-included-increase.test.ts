/**
 * Immediate Switch Prepaid Tests (Attach V2)
 *
 * Tests for upgrades involving prepaid features.
 *
 * IMPORTANT: Immediate switch always involves a DIFFERENT product.
 * You cannot update quantity on the same product via attach.
 *
 * Key behaviors:
 * - Prepaid items require options with quantity
 * - Quantity represents actual units, not packs
 * - Upgrading calculates price difference (refund old + charge new)
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: Prepaid included usage increase (same total quantity)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with prepaid (0 included, quantity 200 = 2 packs @ $10 = $20)
 * - Upgrade to premium with prepaid (100 included, quantity 200)
 *   - With 100 included, quantity 200 means only 1 pack purchased (100 extra)
 *
 * Expected Result:
 * - Old: 2 packs @ $10 = $20 prepaid
 * - New: 1 pack @ $10 = $10 prepaid (100 included covers first 100)
 * - Prepaid diff: $10 - $20 = -$10 (refund)
 * - Base diff: $50 - $20 = $30
 * - Total: $20
 * - Balance = 200 (100 included + 100 purchased)
 */
test.concurrent(
	`${chalk.yellowBright("immediate-switch-prepaid 8: prepaid included increase")}`,
	async () => {
		const customerId = "imm-switch-prepaid-included-inc";

		const proPrepaid = items.prepaidMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const pro = products.pro({
			id: "pro",
			items: [proPrepaid],
		});

		const premiumPrepaid = items.prepaidMessages({
			includedUsage: 100,
			billingUnits: 100,
			price: 10,
		});
		const premium = products.premium({
			id: "premium",
			items: [premiumPrepaid],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
				}),
			],
		});

		// 1. Preview upgrade with same quantity 200
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: premium.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		});
		// Base diff: $50 - $20 = $30
		// Prepaid diff: 1 pack ($10) - 2 packs ($20) = -$10
		// Total: $20
		expect(preview.total).toBe(20);

		// 2. Attach premium
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [pro.id],
		});

		// Verify messages: balance = 200 (100 included + 100 purchased from 1 pack)
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 200,
			usage: 0,
		});
	},
);
