/**
 * Deferred checkout.session.completed retries must not overwrite a later attach.
 *
 * A failed checkout.completed reverts its metadata claim, so Stripe can
 * redeliver the same event after the customer has already moved to another
 * paid plan. modifyStripeSubscriptionFromCheckout then writes the frozen
 * checkout plan back onto the live subscription.
 *
 * Red (current): replaying the original checkout.completed after a later
 * paid attach mutates Stripe back to the checkout plan (and 500s if catalog
 * insert hits a duplicate key).
 * Green (after): premium stays active, pro is not active, Stripe still
 * matches the later attach, and the replay acks 200.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type AppEnv,
	type AttachParamsV1Input,
	MetadataType,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import {
	checkoutSessionIdFromUrl,
	waitForStripeWebhook,
} from "@tests/utils/stripeUtils/waitForStripeWebhook";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { MetadataService } from "@/internal/metadata/MetadataService";

const backendUrl = () =>
	process.env.AUTUMN_BACKEND_URL || "http://localhost:8080";

const replayCheckoutSessionCompleted = async ({
	stripeCli,
	env,
	sessionId,
}: {
	stripeCli: Stripe;
	env: AppEnv;
	sessionId: string;
}): Promise<{ status: number; body: string }> => {
	const events = await stripeCli.events.list({
		type: "checkout.session.completed",
		limit: 100,
	});
	const event = events.data.find(
		(stripeEvent) =>
			(stripeEvent.data.object as Stripe.Checkout.Session).id === sessionId,
	);
	if (!event) {
		throw new Error(`No checkout.session.completed for ${sessionId}`);
	}

	const response = await fetch(`${backendUrl()}/webhooks/connect/${env}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(event),
	});
	return { status: response.status, body: await response.text() };
};

test.concurrent(
	`${chalk.yellowBright("stripe-checkout: stale checkout.completed replay does not overwrite a later attach")}`,
	async () => {
		const customerId = "co-stale-replay";

		const pro = products.pro({
			id: "pro-stale-replay",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "premium-stale-replay",
			items: [items.monthlyMessages({ includedUsage: 200 })],
		});

		const { autumnV2_4, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});

		const result = await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
		});
		expect(result.payment_url).toBeDefined();

		const sessionId = checkoutSessionIdFromUrl(result.payment_url!);
		const session = await ctx.stripeCli.checkout.sessions.retrieve(sessionId);
		const metadataId = session.metadata?.autumn_metadata_id;
		if (!metadataId) {
			throw new Error("checkout session missing autumn_metadata_id");
		}

		const snapshot = await MetadataService.get({
			db: ctx.db,
			id: metadataId,
		});
		if (!snapshot) {
			throw new Error(`metadata ${metadataId} missing before checkout`);
		}

		await completeStripeCheckoutForm({ url: result.payment_url });
		await waitForStripeWebhook({
			stripeCli: ctx.stripeCli,
			env: ctx.env,
			types: ["checkout.session.completed"],
			objectId: sessionId,
			until: async () => {
				const customer =
					await autumnV2_4.customers.get<ApiCustomerV5>(customerId);
				return (customer.subscriptions ?? []).some(
					(subscription) =>
						subscription.plan_id === pro.id && subscription.status === "active",
				);
			},
		});

		await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
		});
		await expectCustomerProducts({
			autumn: autumnV2_4,
			customerId,
			active: [premium.id],
			notPresent: [pro.id],
		});

		await MetadataService.insert({
			db: ctx.db,
			data: {
				id: snapshot.id,
				type: MetadataType.CheckoutSessionV2,
				data: snapshot.data,
				stripe_checkout_session_id: snapshot.stripe_checkout_session_id,
				created_at: snapshot.created_at,
			},
		});

		const replay = await replayCheckoutSessionCompleted({
			stripeCli: ctx.stripeCli,
			env: ctx.env,
			sessionId,
		});
		expect(replay.status).toBe(200);

		await expectCustomerProducts({
			autumn: autumnV2_4,
			customerId,
			active: [premium.id],
			notPresent: [pro.id],
		});
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
