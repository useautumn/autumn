import { describe, expect, it } from "bun:test";
import { stripeErrorToRecaseError } from "../../../../src/classify/stripe/stripeErrorToRecaseError.js";

const stripeError = ({
	type,
	message,
	statusCode,
}: {
	type: string;
	message: string;
	statusCode?: number;
}) => Object.assign(new Error(message), { type, statusCode });

describe("stripeErrorToRecaseError", () => {
	it("answers a merchant-caused Stripe error with its rule's status and Stripe's message", () => {
		const recaseError = stripeErrorToRecaseError({
			error: stripeError({
				type: "StripeCardError",
				message: "Your card was declined.",
			}),
		});
		expect(recaseError?.statusCode).toBe(400);
		expect(recaseError?.code).toBe("invalid_request");
		expect(recaseError?.message).toBe("Your card was declined.");
	});

	it("answers a Stripe rate limit with 429", () => {
		const recaseError = stripeErrorToRecaseError({
			error: stripeError({
				type: "StripeRateLimitError",
				message: "Too many requests",
				statusCode: 429,
			}),
		});
		expect(recaseError?.statusCode).toBe(429);
	});

	it("leaves other Stripe errors and non-Stripe errors alone", () => {
		const noSuchPrice = stripeError({
			type: "StripeInvalidRequestError",
			message: "No such price: 'price_123'",
		});
		expect(stripeErrorToRecaseError({ error: noSuchPrice })).toBeUndefined();
		expect(stripeErrorToRecaseError({ error: new Error("x") })).toBeUndefined();
	});
});
