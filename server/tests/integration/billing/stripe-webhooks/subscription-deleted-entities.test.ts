/**
 * Subscription Deleted Webhook Tests - Entity Scenarios
 *
 * Tests for handling the `customer.subscription.deleted` Stripe webhook event
 * in multi-entity scenarios. These tests simulate canceling subscriptions
 * directly through the Stripe client to verify the webhook handler works correctly
 * for entity-level products.
 */

import { test } from "bun:test";
import type { ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";
import { timeout } from "@/utils/genUtils";

/**
 * Helper to get subscription ID for an entity's customer product.
 */
const getEntitySubscriptionId = async ({
	ctx,
	customerId,
	entityId,
	productId,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId: string;
	productId: string;
}): Promise<string> => {
	const fullCustomer = await CusService.getFull({
		db: ctx.db,
		idOrInternalId: customerId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	const customerProduct = fullCustomer.customer_products.find(
		(cp) => cp.product.id === productId && cp.entity_id === entityId,
	);

	if (!customerProduct?.subscription_ids?.length) {
		throw new Error(
			`No subscription found for product ${productId} on entity ${entityId}`,
		);
	}

	return customerProduct.subscription_ids[0];
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Cancel subscription with multiple entities via Stripe
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Init pro ($20/mo) and free (default) products
 * - Create 2 entities
 * - Attach pro to entity 1 and entity 2
 * - Cancel the subscription directly via Stripe client
 *
 * Expected Result:
 * - Pro is removed from both entities
 * - Free default becomes active for both entities
 * - No Stripe subscription exists
 */
test(`${chalk.yellowBright("sub.deleted entities: cancel subscription with multiple entities via Stripe")}`, async () => {
	const customerId = "sub-deleted-multi-entity";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.attach({ productId: pro.id, entityIndex: 1 }),
		],
	});

	// Verify both entities have pro active
	const entity1After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	const entity2After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);

	await expectProductActive({ customer: entity1After, productId: pro.id });
	await expectProductActive({ customer: entity2After, productId: pro.id });

	// Get subscription ID from entity 1's product
	const subscriptionId = await getEntitySubscriptionId({
		ctx,
		customerId,
		entityId: entities[0].id,
		productId: pro.id,
	});

	// Cancel subscription directly via Stripe client
	await ctx.stripeCli.subscriptions.cancel(subscriptionId);

	// Wait for webhook to process
	await timeout(8000);

	// Verify both entities have pro removed and free active
	const entity1Final = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	const entity2Final = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[1].id,
	);

	// entities don't have default products...
	await expectCustomerProducts({
		customer: entity1Final,
		notPresent: [pro.id, free.id],
	});
	await expectCustomerProducts({
		customer: entity2Final,
		notPresent: [pro.id, free.id],
	});

	// Verify no Stripe subscription exists
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Cancel subscription after tracking usage into overage via Stripe
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Init pro ($20/mo) with consumable overage ($0.10/unit) and free (default)
 * - Create 1 entity
 * - Attach pro to entity 1
 * - Track usage into overage (use more than included)
 * - Cancel the subscription directly via Stripe client
 *
 * Expected Result:
 * - Pro is removed
 * - Free default becomes active
 * - Overage charges should have been handled
 * - No Stripe subscription exists
 */
test(`${chalk.yellowBright("sub.deleted entities: cancel after tracking usage into overage via Stripe")}`, async () => {
	const customerId = "sub-deleted-entity-overage";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 50 })],
		isDefault: true,
	});

	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: pro.id, entityIndex: 0 })],
	});

	// Verify entity 1 has pro active with 100 included usage
	const entityAfterAttach = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	await expectProductActive({ customer: entityAfterAttach, productId: pro.id });
	expectCustomerFeatureCorrect({
		customer: entityAfterAttach,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Track usage beyond included (150 total, 50 overage)
	await autumnV1.track({
		customer_id: customerId,
		entity_id: entities[0].id,
		feature_id: TestFeature.Messages,
		value: 150,
	});

	// Wait for sync
	await timeout(2000);

	// Verify usage was tracked
	const entityAfterTrack = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);
	expectCustomerFeatureCorrect({
		customer: entityAfterTrack,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: -50, // 100 - 150 = -50
		usage: 150,
	});

	// Get subscription ID from entity's product
	const subscriptionId = await getEntitySubscriptionId({
		ctx,
		customerId,
		entityId: entities[0].id,
		productId: pro.id,
	});

	// Cancel subscription directly via Stripe client
	await ctx.stripeCli.subscriptions.cancel(subscriptionId);

	// Wait for webhook to process
	await timeout(8000);

	// Verify entity has pro removed and free active
	const entityFinal = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entities[0].id,
	);

	await expectCustomerProducts({
		customer: entityFinal,
		notPresent: [pro.id, free.id],
	});

	// Verify no Stripe subscription exists
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
