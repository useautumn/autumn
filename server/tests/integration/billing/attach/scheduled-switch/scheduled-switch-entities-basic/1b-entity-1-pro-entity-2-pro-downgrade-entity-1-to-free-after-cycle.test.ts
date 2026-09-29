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
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("scheduled-switch-entities-basic 1b: entity 1 pro, entity 2 pro, downgrade entity 1 to free (after cycle)")}`,
	async () => {
		const customerId = "sched-switch-ent-one-downgrade-b";

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

		// Advance to next cycle
		const {
			autumnV1: autumnV1After,
			entities: entitiesAfter,
			ctx: ctxAfter,
		} = await initScenario({
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
				s.advanceToNextInvoice(),
			],
		});

		// After cycle: entity 1 on free, entity 2 still on pro
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
			notPresent: [pro.id],
		});
		await expectCustomerProducts({
			customer: entity2After,
			active: [pro.id],
			notPresent: [free.id],
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

		// Verify Stripe subscription after cycle (entity 2 still has pro)
		await expectSubToBeCorrect({
			db: ctxAfter.db,
			customerId,
			org: ctxAfter.org,
			env: ctxAfter.env,
		});
	},
);
