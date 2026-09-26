import { describe, expect, test } from "bun:test";
import chalk from "chalk";
import type Stripe from "stripe";
import {
	buildAutumnStripeIdempotencyKey,
	isAutumnOriginatedStripeEvent,
	isStripeDunningSubscriptionDeletion,
} from "@/external/stripe/common/autumnStripeIdempotency";

const buildDeletedEvent = ({
	reason,
	idempotencyKey,
}: {
	reason: Stripe.Subscription.CancellationDetails.Reason | null;
	idempotencyKey: string | null;
}) =>
	({
		type: "customer.subscription.deleted",
		request: { id: "req_test", idempotency_key: idempotencyKey },
		data: {
			object: {
				id: "sub_test",
				status: "canceled",
				cancellation_details: { comment: null, feedback: null, reason },
			},
		},
	}) as unknown as Stripe.CustomerSubscriptionDeletedEvent;

describe(chalk.yellowBright("isStripeDunningSubscriptionDeletion"), () => {
	test("dunning cancel stamped with Autumn's invoices.pay key", () => {
		const event = buildDeletedEvent({
			reason: "payment_failed",
			idempotencyKey: buildAutumnStripeIdempotencyKey({
				source: "invoice.pay",
			}),
		});

		expect(isAutumnOriginatedStripeEvent({ event })).toBe(true);
		expect(isStripeDunningSubscriptionDeletion({ event })).toBe(true);
	});

	test("payment_failed reason alone marks a dunning cancel", () => {
		const event = buildDeletedEvent({
			reason: "payment_failed",
			idempotencyKey: buildAutumnStripeIdempotencyKey({ source: "billing" }),
		});

		expect(isStripeDunningSubscriptionDeletion({ event })).toBe(true);
	});

	test("invoices.pay key alone marks a dunning cancel", () => {
		const event = buildDeletedEvent({
			reason: "cancellation_requested",
			idempotencyKey: buildAutumnStripeIdempotencyKey({
				source: "invoice.pay",
			}),
		});

		expect(isStripeDunningSubscriptionDeletion({ event })).toBe(true);
	});

	test("Autumn's own cancel is not a dunning cancel", () => {
		const event = buildDeletedEvent({
			reason: "cancellation_requested",
			idempotencyKey: buildAutumnStripeIdempotencyKey({
				source: "attach.upgrade_cancel",
			}),
		});

		expect(isAutumnOriginatedStripeEvent({ event })).toBe(true);
		expect(isStripeDunningSubscriptionDeletion({ event })).toBe(false);
	});

	test("a source merely prefixed with invoice.pay is not a dunning cancel", () => {
		const event = buildDeletedEvent({
			reason: "cancellation_requested",
			idempotencyKey: buildAutumnStripeIdempotencyKey({
				source: "invoice.payout",
			}),
		});

		expect(isStripeDunningSubscriptionDeletion({ event })).toBe(false);
	});
});
