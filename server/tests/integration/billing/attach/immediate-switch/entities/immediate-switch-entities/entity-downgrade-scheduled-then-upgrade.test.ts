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
// TEST 4: Premium on both, downgrade entity 1 (scheduled), then upgrade entity 1
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Both entities have premium
 * - Downgrade entity 1 to pro (scheduled)
 * - Upgrade entity 1 to growth (should cancel scheduled)
 *
 * Expected Result:
 * - Scheduled downgrade cancelled
 * - Entity 1 has growth, entity 2 still premium
 */
test.concurrent(
	`${chalk.yellowBright("immediate-switch-entities 4: entity downgrade scheduled, then upgrade")}`,
	async () => {
		const customerId = "imm-switch-ent-down-then-up";

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

		const growthMessages = items.monthlyMessages({ includedUsage: 2000 });
		const growth = products.growth({
			id: "growth",
			items: [growthMessages],
		});

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium, growth] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: premium.id, entityIndex: 0 }),
				s.billing.attach({ productId: premium.id, entityIndex: 1 }),
				s.billing.attach({ productId: pro.id, entityIndex: 0 }), // Downgrade entity 1 (scheduled)
			],
		});

		// Verify entity 1 has scheduled downgrade
		const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);
		await expectProductCanceling({
			customer: entity1Before,
			productId: premium.id,
		});
		await expectProductScheduled({
			customer: entity1Before,
			productId: pro.id,
		});

		// 1. Preview upgrade entity 1 to growth
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: growth.id,
			entity_id: entities[0].id,
		});
		// $100 - $50 = $50
		expect(preview.total).toBe(50);

		// 2. Upgrade entity 1 to growth (should cancel scheduled downgrade)
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: growth.id,
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

		// Entity 1 now has growth (not premium canceling, not pro scheduled)
		await expectCustomerProducts({
			customer: entity1,
			active: [growth.id],
			notPresent: [premium.id, pro.id],
		});
		expectCustomerFeatureCorrect({
			customer: entity1,
			featureId: TestFeature.Messages,
			includedUsage: 2000,
			balance: 2000,
		});

		// Entity 2 still has premium
		await expectProductActive({
			customer: entity2,
			productId: premium.id,
		});
	},
);
