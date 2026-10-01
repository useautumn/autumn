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
// TEST 5: Prepaid billing units change (50 → 100), same quantity
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro with prepaid (200 units @ 50 units/pack = 4 packs @ $10)
 * - Upgrade to premium with prepaid (200 units @ 100 units/pack = 2 packs @ $10)
 *
 * Expected Result:
 * - Same units but fewer packs = lower prepaid cost
 * - Net = base diff + prepaid credit
 */
test.concurrent(
	`${chalk.yellowBright("immediate-switch-prepaid 5: prepaid billing units 50 to 100")}`,
	async () => {
		const customerId = "imm-switch-prepaid-units-50-100";

		const proPrepaid = items.prepaidMessages({
			includedUsage: 0,
			billingUnits: 50,
			price: 10,
		});
		const pro = products.pro({
			id: "pro",
			items: [proPrepaid],
		});

		const premiumPrepaid = items.prepaidMessages({
			includedUsage: 0,
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

		// 1. Preview upgrade
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: premium.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		});
		// Base diff: $50 - $20 = $30
		// Prepaid diff: (2 packs - 4 packs) * $10 = -$20
		// Total: $10
		expect(preview.total).toBe(10);

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

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			balance: 200,
			usage: 0,
		});
	},
);
