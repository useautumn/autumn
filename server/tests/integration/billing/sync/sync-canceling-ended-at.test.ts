/**
 * TDD contract: syncV2 of a CANCELING Stripe subscription always lands the
 * cancel lifecycle fields on the inserted cusProduct.
 *
 * Contract under test:
 *   Behavior: create a Stripe sub directly, set cancel_at_period_end, then
 *   sync via /billing.sync_proposals_v2 -> /billing.sync_v2. The resulting
 *   customer_products row must have:
 *     - canceled = true
 *     - canceled_at set (ms)
 *     - ended_at set (ms) — from Stripe's cancel_at when present; the
 *       anchor+largest-interval fallback covers payloads without it
 *       (unit-tested in tests/unit/billing/sync/get-cancel-fields-from-stripe.spec.ts,
 *       since live Stripe always populates cancel_at)
 *     - starts_at = sub.start_date * 1000
 */
import { expect, test } from "bun:test";
import type { SyncProposalsV2Response } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { createStripeSubscriptionFromProduct } from "./utils/syncTestUtils";

test.concurrent(
	`${chalk.yellowBright("sync-canceling: syncV2 sets canceled_at / ended_at / starts_at")}`,
	async () => {
		const customerId = "sync-canceling-ended-at";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		// 1. Create a Stripe sub directly, then flip it to canceling.
		const stripeSubscription = await createStripeSubscriptionFromProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		const cancelingSub = await ctx.stripeCli.subscriptions.update(
			stripeSubscription.id,
			{ cancel_at_period_end: true },
		);
		expect(cancelingSub.cancel_at_period_end).toBe(true);

		// 2. Sync it through the real V2 pipeline.
		const proposalsResponse: SyncProposalsV2Response = await autumnV1.post(
			"/billing.sync_proposals_v2",
			{ customer_id: customerId },
		);
		const proposal = proposalsResponse.proposals.find(
			(candidate) => candidate.stripe_subscription_id === stripeSubscription.id,
		);
		expect(proposal).toBeDefined();

		await autumnV1.post("/billing.sync_v2", {
			customer_id: customerId,
			stripe_subscription_id: stripeSubscription.id,
			phases: proposal!.phases,
		});

		// 3. The inserted cusProduct carries the full cancel lifecycle.
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const cusProduct = fullCustomer.customer_products.find(
			(customerProduct) =>
				customerProduct.product_id === pro.id &&
				customerProduct.subscription_ids?.includes(stripeSubscription.id),
		);
		expect(cusProduct).toBeDefined();

		expect(cusProduct!.canceled).toBe(true);
		expect(cusProduct!.canceled_at).not.toBeNull();
		expect(cusProduct!.ended_at).not.toBeNull();
		// Live Stripe populates cancel_at for cancel_at_period_end subs.
		expect(cusProduct!.ended_at).toBe(cancelingSub.cancel_at! * 1000);
		expect(cusProduct!.starts_at).toBe(cancelingSub.start_date * 1000);

		// 4. Clean up the directly-created Stripe subscription.
		await ctx.stripeCli.subscriptions.cancel(stripeSubscription.id);
	},
);
