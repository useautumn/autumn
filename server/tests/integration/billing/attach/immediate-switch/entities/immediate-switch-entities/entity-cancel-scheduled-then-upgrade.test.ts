/**
 * Immediate Switch Entity Tests (Attach V2)
 *
 * Tests for upgrade scenarios involving multiple entities (multi-tenant).
 *
 * Key behaviors:
 * - Each entity has independent subscription/products
 * - Upgrading one entity doesn't affect others
 * - Scheduled downgrades can be cancelled by upgrades
 */

import { expect, test } from "bun:test";
import type { ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Both pro, cancel entity 1 (to free), then upgrade entity 1 to premium
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Both entities have pro
 * - Cancel entity 1 (scheduled to free)
 * - Upgrade entity 1 to premium (should override cancel)
 *
 * Expected Result:
 * - Cancel is overridden
 * - Entity 1 has premium, entity 2 still pro
 */
test.concurrent(
	`${chalk.yellowBright("immediate-switch-entities 6: entity cancel scheduled, then upgrade")}`,
	async () => {
		const customerId = "imm-switch-ent-cancel-then-up";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const free = products.base({
			id: "free",
			items: [messagesItem],
		});

		const proMessages = items.monthlyMessages({ includedUsage: 500 });
		const pro = products.pro({
			id: "pro",
			items: [proMessages],
		});

		const premiumMessages = items.monthlyMessages({ includedUsage: 1000 });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessages],
		});

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, premium] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: pro.id, entityIndex: 0 }),
				s.billing.attach({ productId: pro.id, entityIndex: 1 }),
				s.billing.attach({ productId: free.id, entityIndex: 0 }), // Cancel entity 1 (downgrade to free)
			],
		});

		// Verify entity 1 has scheduled cancel
		const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);
		await expectProductCanceling({
			customer: entity1Before,
			productId: pro.id,
		});
		await expectProductScheduled({
			customer: entity1Before,
			productId: free.id,
		});

		// 1. Preview upgrade entity 1 to premium
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: entities[0].id,
		});
		// $50 - $20 = $30
		expect(preview.total).toBe(30);

		// 2. Upgrade entity 1 to premium (should override cancel)
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: entities[0].id,
			redirect_mode: "if_required",
		});

		// Get both entities
		const entity1 = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);
		const entity2 = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[1].id,
		);

		// Entity 1 now has premium (cancel overridden)
		await expectCustomerProducts({
			customer: entity1,
			active: [premium.id],
			notPresent: [pro.id, free.id],
		});
		expectCustomerFeatureCorrect({
			customer: entity1,
			featureId: TestFeature.Messages,
			includedUsage: 1000,
			balance: 1000,
		});

		// Entity 2 still has pro
		await expectProductActive({
			customer: entity2,
			productId: pro.id,
		});
	},
);
