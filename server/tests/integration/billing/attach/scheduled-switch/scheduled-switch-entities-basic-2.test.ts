/**
 * Scheduled Switch Entity Basic Tests (Attach V2) - Slice 2 of 3
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
import {
	expectCustomerProducts,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Entity 1 & 2 premium, downgrade both to free, entity 2 changes to pro
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Both entities on Premium
 * - Downgrade both to Free (scheduled)
 * - Entity 2 changes scheduled product to Pro (replaces Free)
 *
 * Expected Result:
 * - Entity 1: Premium canceling, Free scheduled
 * - Entity 2: Premium canceling, Pro scheduled
 */
test.concurrent(
	`${chalk.yellowBright("scheduled-switch-entities-basic 3a: entity 1 & 2 premium, downgrade both to free, entity 2 changes to pro (mid-cycle)")}`,
	async () => {
		const customerId = "sched-switch-ent-replace-a";

		const freeMessages = items.monthlyMessages({ includedUsage: 50 });
		const free = products.base({
			id: "free",
			items: [freeMessages],
		});

		const proMessages = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro",
			items: [proMessages],
		});

		const premiumMessages = items.monthlyMessages({ includedUsage: 500 });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessages],
		});

		const { autumnV1, entities, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, premium] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: premium.id, entityIndex: 0 }),
				s.billing.attach({ productId: premium.id, entityIndex: 1 }),
				s.billing.attach({ productId: free.id, entityIndex: 0 }), // Downgrade entity 1
				s.billing.attach({ productId: free.id, entityIndex: 1 }), // Downgrade entity 2
			],
		});

		// Verify Stripe subscription
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		// Entity 2: Change scheduled product to pro (replaces free)
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entities[1].id,
			redirect_mode: "if_required",
		});

		// Verify entity 1: premium canceling, free scheduled
		const entity1 = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);
		await expectProductCanceling({
			customer: entity1,
			productId: premium.id,
		});
		await expectProductScheduled({
			customer: entity1,
			productId: free.id,
		});

		// Verify entity 2: premium canceling, pro scheduled (free was replaced)
		const entity2 = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[1].id,
		);
		await expectProductCanceling({
			customer: entity2,
			productId: premium.id,
		});
		await expectProductScheduled({
			customer: entity2,
			productId: pro.id,
		});
		await expectProductNotPresent({
			customer: entity2,
			productId: free.id,
		});

		// Verify Stripe subscription
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("scheduled-switch-entities-basic 3b: entity 1 & 2 premium, downgrade both to free, entity 2 changes to pro (after cycle)")}`,
	async () => {
		const customerId = "sched-switch-ent-replace-b";

		const freeMessages = items.monthlyMessages({ includedUsage: 50 });
		const free = products.base({
			id: "free",
			items: [freeMessages],
		});

		const proMessages = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "pro",
			items: [proMessages],
		});

		const premiumMessages = items.monthlyMessages({ includedUsage: 500 });
		const premium = products.premium({
			id: "premium",
			items: [premiumMessages],
		});

		// Advance to next cycle
		const {
			autumnV1: autumnV1After,
			entities: entitiesAfter,
			ctx: ctxAfter,
		} = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, premium] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: premium.id, entityIndex: 0 }),
				s.billing.attach({ productId: premium.id, entityIndex: 1 }),
				s.billing.attach({ productId: free.id, entityIndex: 0 }), // Downgrade entity 1 to free
				s.billing.attach({ productId: free.id, entityIndex: 1 }), // Downgrade entity 2 to free
				s.billing.attach({ productId: pro.id, entityIndex: 1 }), // Entity 2 changes to pro
				s.advanceToNextInvoice(),
			],
		});

		// After cycle: entity 1 on free, entity 2 on pro
		const entity1After = await autumnV1After.entities.get<ApiEntityV0>(
			customerId,
			entitiesAfter[0].id,
		);
		const entity2After = await autumnV1After.entities.get<ApiEntityV0>(
			customerId,
			entitiesAfter[1].id,
		);

		await expectCustomerProducts({
			customer: entity1After,
			active: [free.id],
			notPresent: [premium.id, pro.id],
		});
		await expectCustomerProducts({
			customer: entity2After,
			active: [pro.id],
			notPresent: [premium.id, free.id],
		});

		// Features at respective tiers
		expectCustomerFeatureCorrect({
			customer: entity1After,
			featureId: TestFeature.Messages,
			balance: 50,
			usage: 0,
		});
		expectCustomerFeatureCorrect({
			customer: entity2After,
			featureId: TestFeature.Messages,
			balance: 100,
			usage: 0,
		});

		// Verify Stripe subscription after cycle (entity 2 has pro)
		await expectSubToBeCorrect({
			db: ctxAfter.db,
			customerId,
			org: ctxAfter.org,
			env: ctxAfter.env,
		});
	},
);
