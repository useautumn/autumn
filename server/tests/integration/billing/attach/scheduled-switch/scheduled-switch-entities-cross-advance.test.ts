// Scheduled switch entity cross tests (attach V2): simultaneous upgrade/downgrade across
// entities and post-cycle upgrades after scheduled downgrades complete.

import { test } from "bun:test";
import type { ApiEntityV0 } from "@autumn/shared";
import {
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Entity 1 premium to free, entity 2 premium to pro, advance cycle, upgrade entity 1 to premium
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity 1: Premium → Free (scheduled)
 * - Entity 2: Premium → Pro (scheduled)
 * - Advance cycle
 * - After downgrade completes, upgrade entity 1 back to premium
 *
 * Expected Result:
 * - After cycle: Entity 1 on free, Entity 2 on pro
 * - After upgrade: Entity 1 on premium (immediate)
 */
test.concurrent(
	`${chalk.yellowBright("scheduled-switch-entities-cross 3: entity 1 premium to free, entity 2 premium to pro, advance cycle, upgrade entity 1 to premium")}`,
	async () => {
		const customerId = "sched-switch-ent-post-cycle-upgrade";

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
				s.billing.attach({ productId: pro.id, entityIndex: 1 }), // Downgrade entity 2
				s.advanceToNextInvoice(),
			],
		});

		// Verify state after cycle
		const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);
		const entity2Before = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[1].id,
		);

		await expectProductActive({
			customer: entity1Before,
			productId: free.id,
		});
		await expectProductActive({
			customer: entity2Before,
			productId: pro.id,
		});

		// Verify Stripe subscription
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		// Upgrade entity 1 back to premium
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: entities[0].id,
			redirect_mode: "if_required",
		});

		// Verify entity 1: premium active (immediate upgrade)
		const entity1After = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);
		await expectProductActive({
			customer: entity1After,
			productId: premium.id,
		});
		await expectProductNotPresent({
			customer: entity1After,
			productId: free.id,
		});

		// Verify Stripe subscription after upgrade
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Entity 1 premiumAnnual to pro, entity 2 premium to pro, advance cycle, upgrade entity 2 to premium
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity 1: Premium Annual → Pro (explicit immediate switch)
 * - Entity 2: Premium Monthly → Pro (scheduled, same interval)
 * - Advance 1 month (monthly cycle ends)
 * - Upgrade entity 2 back to premium
 *
 * Expected Result:
 * - Entity 1 immediately switches to pro via plan_schedule: immediate
 * - Entity 2 has premium canceling, pro scheduled (same interval = end_of_cycle)
 * - After cycle: Entity 1 on pro (renewed), Entity 2 on pro (scheduled switch completed)
 * - After upgrade: Entity 2 on premium
 */
test.concurrent(
	`${chalk.yellowBright("scheduled-switch-entities-cross 4: entity 1 premiumAnnual to pro, entity 2 premium to pro, advance cycle, upgrade entity 2 to premium")}`,
	async () => {
		const customerId = "sched-switch-ent-annual-monthly";

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

		const premiumAnnualMessages = items.monthlyMessages({ includedUsage: 500 });
		const premiumAnnualPrice = items.annualPrice({ price: 500 });
		const premiumAnnual = products.base({
			id: "premium-annual",
			items: [premiumAnnualMessages, premiumAnnualPrice],
		});

		const { autumnV1, entities, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium, premiumAnnual] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: premiumAnnual.id, entityIndex: 0 }),
				s.billing.attach({ productId: premium.id, entityIndex: 1 }),
				s.billing.attach({
					productId: pro.id,
					entityIndex: 0,
					planSchedule: "immediate",
				}),
				s.billing.attach({ productId: pro.id, entityIndex: 1 }), // Entity 2: scheduled (same interval)
				s.advanceToNextInvoice(), // Advance 1 month
			],
		});

		// Entity 1 already switched to pro through the explicit immediate override
		const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);
		await expectProductActive({
			customer: entity1Before,
			productId: pro.id,
		});
		await expectProductNotPresent({
			customer: entity1Before,
			productId: premiumAnnual.id,
		});

		// Entity 2: now on pro (monthly cycle completed, scheduled switch took effect)
		const entity2Before = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[1].id,
		);
		await expectProductActive({
			customer: entity2Before,
			productId: pro.id,
		});
		await expectProductNotPresent({
			customer: entity2Before,
			productId: premium.id,
		});

		// Verify Stripe subscription
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		// Upgrade entity 2 back to premium
		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: entities[1].id,
			redirect_mode: "if_required",
		});

		// Verify entity 2: premium active
		const entity2After = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[1].id,
		);
		await expectProductActive({
			customer: entity2After,
			productId: premium.id,
		});

		// Verify Stripe subscription after upgrade
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
