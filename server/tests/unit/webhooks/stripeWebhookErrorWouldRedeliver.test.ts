/**
 * HTTP 500 vs SQS replay are different: Stripe should still retry a missing
 * catalog price, but the in-house queue must not.
 *
 * Red (current):  FK violations enqueue and SQS-retry like unknown 500s.
 * Green (after):  wouldRedeliver stays true; shouldQueueReplay is false.
 */

import { describe, expect, test } from "bun:test";
import { RecaseError } from "@autumn/shared";
import Stripe from "stripe";
import {
	stripeWebhookErrorShouldQueueReplay,
	stripeWebhookErrorWouldRedeliver,
} from "@/external/stripe/webhookReplay/stripeWebhookErrorWouldRedeliver";

const foreignKeyError = Object.assign(
	new Error(
		'insert or update on table "customer_prices" violates foreign key constraint "customer_prices_price_id_fkey"',
	),
	{ code: "23503" },
);

describe("stripeWebhookErrorWouldRedeliver", () => {
	test("redelivers unknown handler errors (HTTP 500)", () => {
		expect(
			stripeWebhookErrorWouldRedeliver({
				error: new Error("duplicate key value violates unique constraint"),
			}),
		).toBe(true);
	});

	test("still 500s Stripe for foreign-key violations", () => {
		expect(stripeWebhookErrorWouldRedeliver({ error: foreignKeyError })).toBe(
			true,
		);
	});

	test("redelivers RecaseError only when status is 5xx", () => {
		expect(
			stripeWebhookErrorWouldRedeliver({
				error: new RecaseError({ message: "bad request", statusCode: 400 }),
			}),
		).toBe(false);
		expect(
			stripeWebhookErrorWouldRedeliver({
				error: new RecaseError({ message: "db down", statusCode: 500 }),
			}),
		).toBe(true);
	});

	test("does not redeliver Stripe API errors (HTTP 400)", () => {
		expect(
			stripeWebhookErrorWouldRedeliver({
				error: new Stripe.errors.StripeInvalidRequestError({
					message: "No such customer: cus_123",
					type: "invalid_request_error",
				}),
			}),
		).toBe(false);
	});

	test("does not redeliver skipped webhook errors (HTTP 200)", () => {
		expect(
			stripeWebhookErrorWouldRedeliver({
				error: new Error("Not a valid URL"),
			}),
		).toBe(false);
	});
});

describe("stripeWebhookErrorShouldQueueReplay", () => {
	test("queues unknown handler errors that Stripe would retry", () => {
		expect(
			stripeWebhookErrorShouldQueueReplay({
				error: new Error("db connection reset"),
			}),
		).toBe(true);
	});

	test("does not queue Postgres foreign-key violations", () => {
		expect(
			stripeWebhookErrorShouldQueueReplay({ error: foreignKeyError }),
		).toBe(false);
	});

	test("does not queue skipped webhook errors", () => {
		expect(
			stripeWebhookErrorShouldQueueReplay({
				error: new Error("Not a valid URL"),
			}),
		).toBe(false);
	});
});
