/**
 * TDD tests for multiUpdate with entity-scoped plans.
 *
 * Contract under test:
 *   New types/fields:
 *     - Per-update entity_id overrides the top-level entity_id
 *     - Top-level entity_id acts as the default scope for all updates
 *   New behaviors:
 *     - Same plan_id attached to multiple entities: each update resolves its own
 *       entity's cusProduct via its entity_id
 *     - Cancel all entities' plans in one call -> shared sub fully canceled
 *     - Mixed timing across entities on one sub -> one entity removed now, the
 *       other canceling, sub survives until cycle end
 *     - customer_product_id resolves an entity-scoped cusProduct even without
 *       entity context (parity with single update-subscription behavior)
 *
 * Pre-impl red: fails at endpoint resolution (/billing.multi_update 404).
 * Post-impl green: per-item entity resolution narrows fullCustomer per update.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type ApiEntityV2,
	CusProductStatus,
	type MultiUpdateParamsV0Input,
} from "@autumn/shared";
import {
	expectCustomerProducts,
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Cancel the same plan on two entities immediately in one call
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro ($20/mo) attached to entity 1 and entity 2 (shared subscription)
 * - ONE multiUpdate with per-update entity_id: cancel both immediately
 *
 * Expected Result:
 * - Both entity products removed, shared subscription canceled entirely
 */
test.concurrent(
	`${chalk.yellowBright("multi update entities: cancel same plan on two entities immediately")}`,
	async () => {
		const customerId = "multi-update-entities-imm";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_3, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: pro.id, entityIndex: 1 }),
			],
		});

		// ── Contract: per-update entity_id resolves each entity's cusProduct ─────
		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
			customer_id: customerId,
			updates: [
				{
					plan_id: pro.id,
					entity_id: entities[0].id,
					cancel_action: "cancel_immediately",
				},
				{
					plan_id: pro.id,
					entity_id: entities[1].id,
					cancel_action: "cancel_immediately",
				},
			],
		});

		for (const entity of [entities[0], entities[1]]) {
			const entityCustomer = await autumnV2_3.entities.get<ApiEntityV2>(
				customerId,
				entity.id,
			);
			await expectProductNotPresent({
				customer: entityCustomer,
				productId: pro.id,
			});
		}

		// ── Contract: shared sub fully canceled when every entity plan is gone ───
		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Mixed timing across entities on one sub
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro attached to entity 1 and entity 2 (shared subscription)
 * - ONE multiUpdate: cancel entity 1 immediately + entity 2 end of cycle
 *
 * Expected Result:
 * - Entity 1's plan removed now, entity 2's plan canceling
 * - Subscription survives (entity 2 active until cycle end) and is canceling
 */
test.concurrent(
	`${chalk.yellowBright("multi update entities: entity 1 immediately, entity 2 EOC")}`,
	async () => {
		const customerId = "multi-update-entities-mixed";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_3, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: pro.id, entityIndex: 1 }),
			],
		});

		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
			customer_id: customerId,
			updates: [
				{
					plan_id: pro.id,
					entity_id: entities[0].id,
					cancel_action: "cancel_immediately",
				},
				{
					plan_id: pro.id,
					entity_id: entities[1].id,
					cancel_action: "cancel_end_of_cycle",
				},
			],
		});

		const entity1Customer = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			entities[0].id,
		);
		await expectProductNotPresent({
			customer: entity1Customer,
			productId: pro.id,
		});

		const entity2Customer = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			entities[1].id,
		);
		await expectProductCanceling({
			customer: entity2Customer,
			productId: pro.id,
		});

		// ── Contract: sub survives with entity 2's items, set to cancel ──────────
		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
			options: { subCount: 1, shouldBeCanceling: true },
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Top-level entity_id as default scope, per-update override
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro attached to entity 1 and entity 2
 * - multiUpdate with top-level entity_id = entity 1; first update has NO
 *   entity_id (inherits entity 1), second update overrides with entity 2
 *
 * Expected Result:
 * - Both entity plans canceling (each update resolved against its own entity)
 */
test.concurrent(
	`${chalk.yellowBright("multi update entities: top-level entity_id default with per-update override")}`,
	async () => {
		const customerId = "multi-update-entities-scope";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_3, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: pro.id, entityIndex: 1 }),
			],
		});

		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
			customer_id: customerId,
			entity_id: entities[0].id,
			updates: [
				// Inherits top-level entity_id (entity 1)
				{ plan_id: pro.id, cancel_action: "cancel_end_of_cycle" },
				// Overrides with entity 2
				{
					plan_id: pro.id,
					entity_id: entities[1].id,
					cancel_action: "cancel_end_of_cycle",
				},
			],
		});

		for (const entity of [entities[0], entities[1]]) {
			const entityCustomer = await autumnV2_3.entities.get<ApiEntityV2>(
				customerId,
				entity.id,
			);
			await expectProductCanceling({
				customer: entityCustomer,
				productId: pro.id,
			});
		}

		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
			options: { subCount: 1, shouldBeCanceling: true },
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: customer_product_id resolves entity-scoped product without entity context
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro attached to entity 1 and entity 2; customer-level Pro B also active
 * - multiUpdate by customer_product_id (no entity_id anywhere) cancels entity 1's
 *   product + customer-level Pro B
 *
 * Expected Result:
 * - Entity 1's product and Pro B removed; entity 2's product untouched
 */
test.concurrent(
	`${chalk.yellowBright("multi update entities: customer_product_id without entity context")}`,
	async () => {
		const customerId = "multi-update-entities-by-id";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const proB = products.pro({
			id: "pro-b",
			items: [items.monthlyWords({ includedUsage: 100 })],
			group: `${customerId}_b`,
		});

		const { autumnV2_3, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, proB] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: pro.id, entityIndex: 1 }),
				s.attach({ productId: proB.id }),
			],
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const entity1Internal = fullCustomer.entities.find(
			(entity) => entity.id === entities[0].id,
		);
		const entity1Pro = fullCustomer.customer_products.find(
			(customerProduct) =>
				customerProduct.product.id === pro.id &&
				customerProduct.internal_entity_id === entity1Internal?.internal_id &&
				customerProduct.status === CusProductStatus.Active,
		);
		expect(entity1Pro).toBeDefined();

		// ── Contract: customer_product_id works without entity context ───────────
		await autumnV2_3.billing.multiUpdate<MultiUpdateParamsV0Input>({
			customer_id: customerId,
			updates: [
				{
					customer_product_id: entity1Pro!.id,
					cancel_action: "cancel_immediately",
				},
				{ plan_id: proB.id, cancel_action: "cancel_immediately" },
			],
		});

		const entity1Customer = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			entities[0].id,
		);
		await expectProductNotPresent({
			customer: entity1Customer,
			productId: pro.id,
		});

		const entity2Customer = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			entities[1].id,
		);
		await expectProductActive({
			customer: entity2Customer,
			productId: pro.id,
		});

		const customerAfterCancel =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({
			customer: customerAfterCancel,
			notPresent: [proB.id],
		});

		// Entity 2's product keeps the subscription alive and consistent
		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
			options: { subCount: 1 },
		});
	},
);
