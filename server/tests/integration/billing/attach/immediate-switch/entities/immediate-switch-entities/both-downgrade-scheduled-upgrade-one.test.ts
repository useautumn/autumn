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
import {
	expectCustomerProducts,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Both premium, downgrade both (scheduled), upgrade one
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Both entities have premium
 * - Downgrade both to pro (scheduled)
 * - Upgrade entity 2 to growth
 *
 * Expected Result:
 * - Entity 1 still has scheduled downgrade
 * - Entity 2's scheduled downgrade cancelled, now has growth
 */
test.concurrent(
	`${chalk.yellowBright("immediate-switch-entities 5: both downgrade scheduled, upgrade one")}`,
	async () => {
		const customerId = "imm-switch-ent-both-down-one-up";

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
				s.billing.attach({ productId: pro.id, entityIndex: 0 }), // Downgrade entity 1
				s.billing.attach({ productId: pro.id, entityIndex: 1 }), // Downgrade entity 2
			],
		});

		// Verify both have scheduled downgrades
		const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);
		const entity2Before = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[1].id,
		);
		await expectProductCanceling({
			customer: entity1Before,
			productId: premium.id,
		});
		await expectProductScheduled({
			customer: entity1Before,
			productId: pro.id,
		});
		await expectProductCanceling({
			customer: entity2Before,
			productId: premium.id,
		});
		await expectProductScheduled({
			customer: entity2Before,
			productId: pro.id,
		});

		// 1. Preview upgrade entity 2 to growth
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: growth.id,
			entity_id: entities[1].id,
		});
		// $100 - $50 = $50
		expect(preview.total).toBe(50);

		// 2. Upgrade entity 2 to growth
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: growth.id,
			entity_id: entities[1].id,
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

		// Entity 1 still has scheduled downgrade (unchanged)
		await expectProductCanceling({
			customer: entity1,
			productId: premium.id,
		});
		await expectProductScheduled({
			customer: entity1,
			productId: pro.id,
		});

		// Entity 2 now has growth
		await expectCustomerProducts({
			customer: entity2,
			active: [growth.id],
			notPresent: [premium.id, pro.id],
		});
	},
);
