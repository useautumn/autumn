import { describe, expect, it } from "bun:test";
import { classifyStripeError } from "../../../../src/classify/stripe/classifyStripeError.js";

const stripeError = ({ type, message }: { type: string; message: string }) =>
	Object.assign(new Error(message), { type });

describe("classifyStripeError", () => {
	it("treats any card error as expected: it's the end customer's card", () => {
		const error = stripeError({
			type: "StripeCardError",
			message: "Your card has insufficient funds.",
		});
		expect(classifyStripeError({ error })).toEqual({
			kind: "expected",
			code: "card_error",
		});
	});

	it("classifies a caller-rule match like its RecaseError", () => {
		const error = stripeError({
			type: "StripeInvalidRequestError",
			message: "Not a valid URL",
		});
		expect(classifyStripeError({ error })?.kind).toBe("expected");
	});

	it("leaves other Stripe errors to fall through as bugs", () => {
		const error = stripeError({
			type: "StripeInvalidRequestError",
			message: "No such price: 'price_123'",
		});
		expect(classifyStripeError({ error })).toBeUndefined();
	});
});
