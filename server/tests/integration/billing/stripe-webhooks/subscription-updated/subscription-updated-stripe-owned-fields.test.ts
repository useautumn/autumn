/**
 * Subscription Updated Webhook - Stripe-owned field sync
 *
 * `customer.subscription.updated` mirrors `trial_end` / `collection_method`
 * onto the Autumn products on that subscription. A shared subscription can
 * carry an Autumn-only trial that Stripe never knew about (e.g. a trial on a
 * sibling entity), so those fields must only move when Stripe changed them,
 * and `trial_ends_at` must only move on products whose trial was Stripe's.
 *
 * The Autumn-only trial is seeded directly in the DB: it stands in for a
 * trial merged onto an already-paid subscription or living in a schedule phase.
 */

import { expect, test } from "bun:test";
import {
	ALL_STATUSES,
	type ApiEntityV2,
	type AttachParamsV1Input,
	CollectionMethod,
	type FullCusProduct,
	ms,
	msToSeconds,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { pollUntilAsserted, timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

// Webhooks queue behind concurrent tests on one worker, so a no-op assertion
// needs a generous settle before it proves anything.
const WEBHOOK_SETTLE_MS = 20_000;

const getEntityCustomerProduct = async ({
	ctx,
	customerId,
	entityId,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId: string;
}): Promise<FullCusProduct> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: ALL_STATUSES,
	});

	const customerProduct = fullCustomer.customer_products.find(
		(customerProduct) => customerProduct.entity_id === entityId,
	);
	if (!customerProduct) {
		throw new Error(`No customer product for entity ${entityId}`);
	}
	return customerProduct;
};

const seedAutumnOnlyTrial = async ({
	ctx,
	customerProduct,
	trialEndsAt,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	trialEndsAt: number;
}) => {
	await CusProductService.update({
		ctx,
		cusProductId: customerProduct.id,
		updates: { trial_ends_at: trialEndsAt },
	});
};

/** Polls an entity's product until the webhook's expected write lands. */
const waitForEntityCustomerProduct = ({
	ctx,
	customerId,
	entityId,
	assert,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId: string;
	assert: (customerProduct: FullCusProduct) => void;
}) =>
	pollUntilAsserted({
		fetch: () => getEntityCustomerProduct({ ctx, customerId, entityId }),
		assert,
	});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: A non-trial Stripe change leaves an Autumn-only trial alone
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity-1 and entity-2 share one paid pro subscription (no Stripe trial)
 * - Entity-2 carries an Autumn-only trial (trial_ends_at set, Stripe trial_end null)
 * - Stripe flips the subscription to send_invoice (trial_end unchanged)
 *
 * Expected Result:
 * - collection_method is mirrored onto both entities (proves the event was processed)
 * - Entity-2's trial_ends_at is untouched
 */
test.concurrent(
	`${chalk.yellowBright("sub.updated: non-trial Stripe change leaves an Autumn-only trial alone")}`,
	async () => {
		const customerId = "sub-updated-keeps-autumn-trial";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, entities, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: pro.id, entityIndex: 0 }),
				s.billing.attach({ productId: pro.id, entityIndex: 1 }),
			],
		});

		const autumnOnlyTrialEndsAt = advancedTo + ms.days(30);
		const entity2Before = await getEntityCustomerProduct({
			ctx,
			customerId,
			entityId: entities[1].id,
		});
		await seedAutumnOnlyTrial({
			ctx,
			customerProduct: entity2Before,
			trialEndsAt: autumnOnlyTrialEndsAt,
		});

		const subscriptionId = await getSubscriptionId({
			ctx,
			customerId,
			productId: pro.id,
		});

		await ctx.stripeCli.subscriptions.update(subscriptionId, {
			collection_method: "send_invoice",
			days_until_due: 30,
		});

		await waitForEntityCustomerProduct({
			ctx,
			customerId,
			entityId: entities[0].id,
			assert: (entity1) =>
				expect(entity1.collection_method).toBe(CollectionMethod.SendInvoice),
		});

		const entity1 = await getEntityCustomerProduct({
			ctx,
			customerId,
			entityId: entities[0].id,
		});
		const entity2 = await getEntityCustomerProduct({
			ctx,
			customerId,
			entityId: entities[1].id,
		});

		expect(entity1.trial_ends_at).toBeNull();
		expect(entity2.trial_ends_at).toBe(autumnOnlyTrialEndsAt);
		expect(entity2.collection_method).toBe(CollectionMethod.SendInvoice);
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Shortening the Stripe trial moves only the Stripe-owned trial
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity-1 and entity-2 share one pro-trial subscription (7-day Stripe trial)
 * - Entity-2's trial is re-seeded to an Autumn-only 30-day trial
 * - The Stripe trial is shortened to 3 days from the dashboard
 *
 * Expected Result:
 * - Entity-1 (trial matched Stripe's previous trial_end) moves to 3 days
 * - Entity-2 (Autumn-only trial) keeps its 30-day trial
 */
test.concurrent(
	`${chalk.yellowBright("sub.updated: shortening the Stripe trial moves only the Stripe-owned trial")}`,
	async () => {
		const customerId = "sub-updated-shorten-stripe-trial";

		const proTrial = products.proWithTrial({
			id: "pro-trial",
			items: [items.monthlyMessages({ includedUsage: 100 })],
			trialDays: 7,
			cardRequired: true,
		});

		const { ctx, entities, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: proTrial.id, entityIndex: 0 }),
				s.billing.attach({ productId: proTrial.id, entityIndex: 1 }),
			],
		});

		const autumnOnlyTrialEndsAt = advancedTo + ms.days(30);
		const entity2Before = await getEntityCustomerProduct({
			ctx,
			customerId,
			entityId: entities[1].id,
		});
		await seedAutumnOnlyTrial({
			ctx,
			customerProduct: entity2Before,
			trialEndsAt: autumnOnlyTrialEndsAt,
		});

		const subscriptionId = await getSubscriptionId({
			ctx,
			customerId,
			productId: proTrial.id,
		});

		const shortenedTrialEndSec = msToSeconds(advancedTo + ms.days(3));
		await ctx.stripeCli.subscriptions.update(subscriptionId, {
			trial_end: shortenedTrialEndSec,
			proration_behavior: "none",
		});

		await waitForEntityCustomerProduct({
			ctx,
			customerId,
			entityId: entities[0].id,
			assert: (entity1) =>
				expect(entity1.trial_ends_at).toBe(shortenedTrialEndSec * 1000),
		});

		const entity2 = await getEntityCustomerProduct({
			ctx,
			customerId,
			entityId: entities[1].id,
		});
		expect(entity2.trial_ends_at).toBe(autumnOnlyTrialEndsAt);
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Ending the Stripe trial early ends only the Stripe-owned trial
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Same setup as test 2
 * - The Stripe trial is ended now from the dashboard (trial_end: "now")
 *
 * Expected Result:
 * - Entity-1's trial_ends_at moves to Stripe's new trial_end (now, so no longer trialing)
 * - Entity-2 keeps its Autumn-only trial
 */
test.concurrent(
	`${chalk.yellowBright("sub.updated: ending the Stripe trial early ends only the Stripe-owned trial")}`,
	async () => {
		const customerId = "sub-updated-end-stripe-trial";

		const proTrial = products.proWithTrial({
			id: "pro-trial",
			items: [items.monthlyMessages({ includedUsage: 100 })],
			trialDays: 7,
			cardRequired: true,
		});

		const { ctx, entities, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: proTrial.id, entityIndex: 0 }),
				s.billing.attach({ productId: proTrial.id, entityIndex: 1 }),
			],
		});

		const autumnOnlyTrialEndsAt = advancedTo + ms.days(30);
		const entity2Before = await getEntityCustomerProduct({
			ctx,
			customerId,
			entityId: entities[1].id,
		});
		await seedAutumnOnlyTrial({
			ctx,
			customerProduct: entity2Before,
			trialEndsAt: autumnOnlyTrialEndsAt,
		});

		const subscriptionId = await getSubscriptionId({
			ctx,
			customerId,
			productId: proTrial.id,
		});

		// Stripe keeps trial_end set to the moment the trial ended, not null
		const endedSubscription = await ctx.stripeCli.subscriptions.update(
			subscriptionId,
			{ trial_end: "now", proration_behavior: "none" },
		);
		const endedTrialEndsAt = endedSubscription.trial_end! * 1000;
		expect(endedTrialEndsAt).toBeLessThan(autumnOnlyTrialEndsAt);

		await waitForEntityCustomerProduct({
			ctx,
			customerId,
			entityId: entities[0].id,
			assert: (entity1) => expect(entity1.trial_ends_at).toBe(endedTrialEndsAt),
		});

		const entity2 = await getEntityCustomerProduct({
			ctx,
			customerId,
			entityId: entities[1].id,
		});
		expect(entity2.trial_ends_at).toBe(autumnOnlyTrialEndsAt);
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Editing a sibling entity's plan leaves an Autumn-only trial alone
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity-1 and entity-2 share one paid pro subscription (no Stripe trial)
 * - Entity-2 carries an Autumn-only trial
 * - Entity-1 is moved to premium through Autumn (items change on the shared sub)
 *
 * Expected Result:
 * - Entity-1 is on premium
 * - Entity-2 keeps its trial after the attach and the sub.updated it triggers
 */
test.concurrent(
	`${chalk.yellowBright("sub.updated: editing a sibling entity's plan leaves an Autumn-only trial alone")}`,
	async () => {
		const customerId = "sub-updated-sibling-plan-edit";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({ id: "pro", items: [messagesItem] });
		const premium = products.premium({ id: "premium", items: [messagesItem] });

		const { ctx, entities, advancedTo, autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: pro.id, entityIndex: 0 }),
				s.billing.attach({ productId: pro.id, entityIndex: 1 }),
			],
		});

		const autumnOnlyTrialEndsAt = advancedTo + ms.days(30);
		const entity2Before = await getEntityCustomerProduct({
			ctx,
			customerId,
			entityId: entities[1].id,
		});
		await seedAutumnOnlyTrial({
			ctx,
			customerProduct: entity2Before,
			trialEndsAt: autumnOnlyTrialEndsAt,
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: premium.id,
			redirect_mode: "if_required",
		});
		await timeout(WEBHOOK_SETTLE_MS);

		const entity1 = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			entities[0].id,
		);
		await expectCustomerProducts({
			customer: entity1,
			active: [premium.id],
			notPresent: [pro.id],
		});

		const entity2 = await getEntityCustomerProduct({
			ctx,
			customerId,
			entityId: entities[1].id,
		});
		expect(entity2.trial_ends_at).toBe(autumnOnlyTrialEndsAt);
		expect(entity2.collection_method).toBe(
			CollectionMethod.ChargeAutomatically,
		);
	},
);
