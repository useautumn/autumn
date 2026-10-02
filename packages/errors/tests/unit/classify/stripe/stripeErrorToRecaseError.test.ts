import { describe, expect, it } from "bun:test";
import { stripeErrorToRecaseError } from "../../../../src/classify/stripe/stripeErrorToRecaseError.js";

const stripeError = ({
	type = "StripeInvalidRequestError",
	message,
	statusCode,
	code,
	param,
}: {
	type?: string;
	message: string;
	statusCode?: number;
	code?: string;
	param?: string;
}) => Object.assign(new Error(message), { type, statusCode, code, param });

const noSuchSubscription = stripeError({
	message: "No such subscription: 'sub_123'",
	statusCode: 404,
	code: "resource_missing",
});

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
		const noSuchPrice = stripeError({ message: "No such price: 'price_123'" });
		expect(stripeErrorToRecaseError({ error: noSuchPrice })).toBeUndefined();
		expect(stripeErrorToRecaseError({ error: new Error("x") })).toBeUndefined();
	});

	it.each([
		"/v1/billing.attach",
		"/v1/cancel",
		"/v1/checkout",
		"/v1/stripe.get",
		"/v1/billing.preview_update",
		"/v1/customers/cus_123",
		"/customers/cus_123/referrals",
	])(
		"answers a missing Stripe resource on caller route %s with a 404",
		(path) => {
			const recaseError = stripeErrorToRecaseError({
				error: noSuchSubscription,
				path,
			});
			expect(recaseError?.statusCode).toBe(404);
			expect(recaseError?.code).toBe("stripe_resource_missing");
			expect(recaseError?.message).toBe("No such subscription: 'sub_123'");
		},
	);

	it.each([
		"/v1/track",
		"/v1/events",
		"/v1/usage",
		"/v1/check",
		"/v1/balances.track",
		"/v1/balances/update",
		"/v1/entities.create",
		"/v1/customers/cus_123/entities",
		"/v1/customers/cus_123/balances",
		"/webhooks/connect/live",
		"/webhooks/stripe/org_123/live",
	])(
		"keeps a missing Stripe resource on %s ours: usage and webhooks reach Stripe as billing side effects",
		(path) => {
			expect(
				stripeErrorToRecaseError({ error: noSuchSubscription, path }),
			).toBeUndefined();
		},
	);

	it("keeps a missing Stripe resource outside a request ours", () => {
		expect(
			stripeErrorToRecaseError({ error: noSuchSubscription }),
		).toBeUndefined();
	});

	it.each([
		"The `trial_end` date has to be at least 2 days in the future.",
		"Array discounts exceeded maximum 1 allowed elements.",
		"`cancellation_details` can only be set on subscriptions that are set to cancel.",
		"Missing email. In order to create invoices that are sent to the customer, the customer must have a valid email.",
	])("answers the caller's invalid Stripe params with a 400: %s", (message) => {
		const recaseError = stripeErrorToRecaseError({
			error: stripeError({ message }),
		});
		expect(recaseError?.statusCode).toBe(400);
		expect(recaseError?.code).toBe("invalid_request");
		expect(recaseError?.message).toBe(message);
	});

	it("answers a coupon name over 40 characters with a 400, but no other over-long param", () => {
		const message =
			"Invalid string: xxxx...xxxx; must be at most 40 characters";
		expect(
			stripeErrorToRecaseError({
				error: stripeError({ message, param: "name" }),
			})?.statusCode,
		).toBe(400);
		expect(
			stripeErrorToRecaseError({
				error: stripeError({ message, param: "description" }),
			}),
		).toBeUndefined();
	});
});
