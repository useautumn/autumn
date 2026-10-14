import { describe, expect, test } from "bun:test";
import { type Metadata, MetadataType } from "@autumn/shared";
import Stripe from "stripe";
import type { RepoContext } from "@/db/repoContext";
import { cancelCreatedStripeSubscription } from "@/internal/billing/v2/actions/expirePendingPlan/execute/cancelCreatedStripeSubscription";

const metadata = {
	id: "meta_123",
	type: MetadataType.DeferredInvoice,
	data: {
		billingPlan: { stripe: { subscriptionAction: { type: "create" } } },
	},
} as unknown as Metadata;

const stripeInvoice = {
	id: "in_123",
	parent: { subscription_details: { subscription: "sub_123" } },
} as unknown as Stripe.Invoice;

const ctx = {
	logger: { info: () => {}, warn: () => {}, error: () => {} },
} as unknown as RepoContext;

const stripeCliWith = ({ retrieve }: { retrieve: () => Promise<unknown> }) => {
	const cancelled: string[] = [];
	const stripeCli = {
		subscriptions: {
			retrieve,
			cancel: async (id: string) => {
				cancelled.push(id);
				return { id, status: "canceled" };
			},
		},
	} as unknown as Stripe;
	return { stripeCli, cancelled };
};

describe("cancelCreatedStripeSubscription", () => {
	test("a subscription missing from Stripe counts as already ended", async () => {
		const { stripeCli, cancelled } = stripeCliWith({
			retrieve: async () => {
				throw new Stripe.errors.StripeInvalidRequestError({
					type: "invalid_request_error",
					code: "resource_missing",
					message: "No such subscription: 'sub_123'",
				});
			},
		});

		await cancelCreatedStripeSubscription({
			ctx,
			stripeCli,
			metadata,
			stripeInvoice,
		});
		expect(cancelled).toEqual([]);
	});

	test("any other Stripe failure still throws so the cron retries", async () => {
		const { stripeCli } = stripeCliWith({
			retrieve: async () => {
				throw new Stripe.errors.StripeAPIError({
					type: "api_error",
					message: "boom",
				});
			},
		});

		await expect(
			cancelCreatedStripeSubscription({
				ctx,
				stripeCli,
				metadata,
				stripeInvoice,
			}),
		).rejects.toThrow("boom");
	});

	test("a live created subscription is cancelled", async () => {
		const { stripeCli, cancelled } = stripeCliWith({
			retrieve: async () => ({ id: "sub_123", status: "active" }),
		});

		await cancelCreatedStripeSubscription({
			ctx,
			stripeCli,
			metadata,
			stripeInvoice,
		});
		expect(cancelled).toEqual(["sub_123"]);
	});
});
