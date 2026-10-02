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
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Entity 1 free, entity 2 free, upgrade entity 2 to pro
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Two entities on free
 * - Upgrade entity 2 to pro
 *
 * Expected Result:
 * - Entity 2 has pro, entity 1 still has free
 * - Independent states
 */
test.concurrent(
	`${chalk.yellowBright("immediate-switch-entities 1: entity free, upgrade one to pro")}`,
	async () => {
		const customerId = "imm-switch-ent-free-to-pro";

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

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: free.id, entityIndex: 0 }),
				s.billing.attach({ productId: free.id, entityIndex: 1 }),
			],
		});

		// 1. Preview upgrade entity 2 to pro
		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entities[1].id,
		});
		expect(preview.total).toBe(20);

		// 2. Upgrade entity 2
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
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

		// Entity 1 still has free
		await expectProductActive({
			customer: entity1,
			productId: free.id,
		});
		expectCustomerFeatureCorrect({
			customer: entity1,
			featureId: TestFeature.Messages,
			includedUsage: 100,
			balance: 100,
			usage: 0,
		});

		// Entity 2 now has pro
		await expectCustomerProducts({
			customer: entity2,
			active: [pro.id],
			notPresent: [free.id],
		});
		expectCustomerFeatureCorrect({
			customer: entity2,
			featureId: TestFeature.Messages,
			includedUsage: 500,
			balance: 500,
			usage: 0,
		});

		// Verify invoice on customer
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerInvoiceCorrect({
			customer,
			count: 1,
			latestTotal: 20,
		});
	},
);
