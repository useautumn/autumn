import { describe, expect, test } from "bun:test";
import { RecaseError } from "@autumn/shared";
import Stripe from "stripe";
import { stripeWebhookErrorWouldRedeliver } from "@/external/stripe/webhookReplay/stripeWebhookErrorWouldRedeliver";

describe("stripeWebhookErrorWouldRedeliver", () => {
	test("redelivers unknown handler errors (HTTP 500)", () => {
		expect(
			stripeWebhookErrorWouldRedeliver({
				error: new Error("duplicate key value violates unique constraint"),
			}),
		).toBe(true);
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
