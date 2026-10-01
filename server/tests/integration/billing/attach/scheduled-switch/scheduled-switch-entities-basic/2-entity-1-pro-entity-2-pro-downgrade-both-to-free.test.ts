/**
 * Scheduled Switch Entity Basic Tests (Attach V2)
 *
 * Tests for basic downgrade scenarios involving multiple entities (sub-accounts).
 *
 * Key behaviors:
 * - Each entity has independent product states
 * - Downgrades on one entity don't affect other entities
 * - Scheduled products can be replaced independently per entity
 */

import { test } from "bun:test";
import type { ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Entity 1 pro, entity 2 pro, downgrade both to free
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Both entities on pro
 * - Downgrade both to free
 * - Advance cycle
 *
 * Expected Result:
 * - Both have free scheduled
 * - After cycle: both on free
 */
test.concurrent(
	`${chalk.yellowBright("scheduled-switch-entities-basic 2: entity 1 pro, entity 2 pro, downgrade both to free")}`,
	async () => {
		const customerId = "sched-switch-ent-both-downgrade";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro",
			items: [messagesItem],
		});

		const freeMessages = items.monthlyMessages({ includedUsage: 50 });
		const free = products.base({
			id: "free",
			items: [freeMessages],
		});

		const { autumnV1, entities, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, free] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: pro.id, entityIndex: 0 }),
				s.billing.attach({ productId: pro.id, entityIndex: 1 }),
				s.billing.attach({ productId: free.id, entityIndex: 0 }), // Downgrade entity 1
				s.billing.attach({ productId: free.id, entityIndex: 1 }), // Downgrade entity 2
				s.advanceToNextInvoice(),
			],
		});

		// After cycle: both entities on free
		const entity1 = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);
		const entity2 = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[1].id,
		);

		await expectCustomerProducts({
			customer: entity1,
			active: [free.id],
			notPresent: [pro.id],
		});
		await expectCustomerProducts({
			customer: entity2,
			active: [free.id],
			notPresent: [pro.id],
		});

		// Features at free tier
		expectCustomerFeatureCorrect({
			customer: entity1,
			featureId: TestFeature.Messages,
			balance: 50,
			usage: 0,
		});
		expectCustomerFeatureCorrect({
			customer: entity2,
			featureId: TestFeature.Messages,
			balance: 50,
			usage: 0,
		});

		// After both downgraded to free, there should be no Stripe subscriptions
		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
