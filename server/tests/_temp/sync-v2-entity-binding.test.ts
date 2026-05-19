/**
 * TDD repro for syncV2 entity binding bug.
 *
 * Bug: When the caller passes `phases[].plans[].internal_entity_id` to
 * `billing.sync_v2`, the inserted customer product is NOT bound to that
 * entity. `initCustomerProduct` sources `internal_entity_id` only from
 * `fullCustomer.entity` (the customer's currently-set entity context),
 * ignoring the plan's intent. The data DOES flow through SyncPlanInstance →
 * SyncProductContext.plan (it's even logged in logSyncContext), but
 * `initImmediateSyncCustomerProduct` never threads it down to
 * `initFullCustomerProduct`, and `InitFullCustomerProductOptions` has no
 * field to receive it.
 *
 * Red (current): cusProduct.internal_entity_id is null after sync.
 * Green (after fix): cusProduct.internal_entity_id === plan.internal_entity_id.
 */

import { expect, test } from "bun:test";
import chalk from "chalk";
import { createStripeSubscriptionFromProduct } from "@tests/integration/billing/sync/utils/syncTestUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { CusService } from "@/internal/customers/CusService";
import { EntityService } from "@/internal/api/entities/EntityService";

test(
	chalk.yellowBright(
		"sync-v2 entity binding: plan.internal_entity_id must propagate to inserted customer product",
	),
	async () => {
		const customerId = "sync-v2-entity-bind";

		const pro = products.pro({
			id: "sync-v2-entity-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [],
		});

		const fullCustomerBefore = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});

		const entityList = await EntityService.list({
			db: ctx.db,
			internalCustomerId: fullCustomerBefore.internal_id,
		});
		expect(entityList.length).toBeGreaterThan(0);
		const targetEntity = entityList[0];
		const targetEntityInternalId = targetEntity.internal_id;

		const stripeSubscription = await createStripeSubscriptionFromProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(stripeSubscription.status).toBe("active");

		await autumnV1.post("/billing.sync_v2", {
			customer_id: customerId,
			stripe_subscription_id: stripeSubscription.id,
			phases: [
				{
					starts_at: "now",
					plans: [
						{
							plan_id: pro.id,
							internal_entity_id: targetEntityInternalId,
						},
					],
				},
			],
		});

		const fullCustomerAfter = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});

		const cusProduct = fullCustomerAfter.customer_products.find(
			(cp) => cp.product_id === pro.id,
		);
		expect(cusProduct).toBeDefined();
		expect(cusProduct!.internal_entity_id).toBe(targetEntityInternalId);
	},
);
