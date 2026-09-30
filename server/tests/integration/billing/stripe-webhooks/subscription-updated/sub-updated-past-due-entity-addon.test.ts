/**
 * sub.updated auto-sync on a past_due subscription must keep an entity-scoped
 * add-on on its entity. Past-due plans are still live, so a Stripe-side
 * quantity bump has to add instances on the same entity, never duplicate the
 * add-on at the customer level.
 */

import { expect, test } from "bun:test";
import { ACTIVE_STATUSES, type FullCusProduct } from "@autumn/shared";
import { driveProductPastDue } from "@tests/integration/billing/utils/driveProductPastDue";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AUTUMN_STRIPE_METADATA_KEYS } from "@/internal/billing/v2/providers/stripe/utils/common/autumnStripeMetadata";
import { CusService } from "@/internal/customers/CusService";
import { timeout } from "@/utils/genUtils";

/** Past Autumn's recent-action window, so auto-sync treats the change as external. */
const STALE_AUTUMN_ACTION_MS = 11 * 60 * 1000;
const WEBHOOK_WAIT_MS = 60_000;
const POLL_INTERVAL_MS = 2_000;

const liveAddOnInstances = async ({
	ctx,
	customerId,
	addOnId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customerId: string;
	addOnId: string;
}): Promise<FullCusProduct[]> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	return fullCustomer.customer_products.filter(
		(customerProduct) =>
			customerProduct.product.id === addOnId &&
			ACTIVE_STATUSES.includes(customerProduct.status),
	);
};

test(`${chalk.yellowBright("sub.updated auto-sync: past_due entity add-on quantity bump stays on the entity")}`, async () => {
	const customerId = "sub-updated-past-due-entity-addon";
	const addOn = products.base({
		id: "past-due-entity-addon",
		isAddOn: true,
		items: [
			items.monthlyPrice({ price: 10 }),
			items.monthlyMessages({ includedUsage: 100 }),
		],
	});

	const { ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [addOn] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId: addOn.id, entityIndex: 0 })],
	});

	const { subscriptionId } = await driveProductPastDue({
		ctx,
		testClockId: testClockId!,
		customerId,
		productId: addOn.id,
	});

	const [original] = await liveAddOnInstances({
		ctx,
		customerId,
		addOnId: addOn.id,
	});
	expect(original?.internal_entity_id).toBeTruthy();
	const entityInternalId = original?.internal_entity_id ?? null;

	const subscription =
		await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
	expect(subscription.status).toBe("past_due");
	const [addOnItem] = subscription.items.data;

	// Someone adds a second pack in the Stripe dashboard while payment is overdue.
	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		items: [{ id: addOnItem!.id, quantity: 2 }],
		proration_behavior: "none",
		metadata: {
			[AUTUMN_STRIPE_METADATA_KEYS.managedAt]: String(
				Date.now() - STALE_AUTUMN_ACTION_MS,
			),
		},
	});

	let instances = await liveAddOnInstances({
		ctx,
		customerId,
		addOnId: addOn.id,
	});
	const deadline = Date.now() + WEBHOOK_WAIT_MS;
	while (instances.length < 2 && Date.now() < deadline) {
		await timeout(POLL_INTERVAL_MS);
		instances = await liveAddOnInstances({
			ctx,
			customerId,
			addOnId: addOn.id,
		});
	}

	expect(
		instances.map((instance) => instance.internal_entity_id ?? null),
	).toEqual([entityInternalId, entityInternalId]);
});
