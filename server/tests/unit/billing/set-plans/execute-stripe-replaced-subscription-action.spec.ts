import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { FullCustomer } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

type StripeErrorFields = { code?: string; type?: string; statusCode?: number };

const stripeState = {
	cancelErrors: [] as Error[],
	cancelCalls: 0,
	retrievedStatus: "incomplete" as Stripe.Subscription.Status,
};
const loggedErrors: string[] = [];

await mockModuleWithRestore("@server/external/connect/createStripeCli", () => ({
	createStripeCli: () => ({
		subscriptions: {
			cancel: async (id: string) => {
				stripeState.cancelCalls++;
				const cancelError = stripeState.cancelErrors.shift();
				if (cancelError) throw cancelError;
				return { id, status: "canceled" };
			},
			retrieve: async (id: string) => ({
				id,
				status: stripeState.retrievedStatus,
			}),
		},
	}),
}));

const { executeStripeReplacedSubscriptionAction } = await import(
	"@/internal/billing/v2/providers/stripe/execute/executeStripeReplacedSubscriptionAction"
);

const ctx = {
	org: { id: "org_123" },
	env: "sandbox",
	logger: {
		info: () => {},
		warn: () => {},
		error: (message: string) => loggedErrors.push(message),
	},
} as unknown as AutumnContext;

const cancelReplaced = () =>
	executeStripeReplacedSubscriptionAction({
		ctx,
		fullCustomer: {
			id: "cus_123",
			customer_products: [],
		} as unknown as FullCustomer,
		replacedSubscriptionAction: {
			type: "cancel",
			stripeSubscriptionId: "sub_old",
		},
	});

const stripeError = (fields: StripeErrorFields = {}) =>
	Object.assign(new Error("stripe rejected the cancel"), fields);

const stripeRateLimitError = () =>
	stripeError({ type: "StripeRateLimitError", statusCode: 429 });

describe("executeStripeReplacedSubscriptionAction", () => {
	beforeEach(() => {
		stripeState.cancelErrors = [];
		stripeState.cancelCalls = 0;
		stripeState.retrievedStatus = "incomplete";
		loggedErrors.length = 0;
	});

	test("a subscription another request already cancelled counts as cancelled", async () => {
		stripeState.cancelErrors = [stripeError()];
		stripeState.retrievedStatus = "canceled";

		await cancelReplaced();

		expect(loggedErrors).toEqual([]);
	});

	test("a subscription Stripe no longer has counts as cancelled", async () => {
		stripeState.cancelErrors = [stripeError({ code: "resource_missing" })];

		await cancelReplaced();

		expect(loggedErrors).toEqual([]);
	});

	test("a failed cancel is logged and doesn't stop the new plan applying", async () => {
		stripeState.cancelErrors = [stripeError()];

		await cancelReplaced();

		expect(loggedErrors).toHaveLength(1);
		expect(loggedErrors[0]).toContain("sub_old");
		expect(loggedErrors[0]).toContain("cus_123");
	});

	test("a transiently rejected cancel is retried until Stripe accepts it", async () => {
		stripeState.cancelErrors = [stripeRateLimitError()];

		await cancelReplaced();

		expect(stripeState.cancelCalls).toBe(2);
		expect(loggedErrors).toEqual([]);
	});

	test("a cancel Stripe rejects outright is not retried", async () => {
		stripeState.cancelErrors = [
			stripeError({ type: "StripeInvalidRequestError", statusCode: 400 }),
		];

		await cancelReplaced();

		expect(stripeState.cancelCalls).toBe(1);
		expect(loggedErrors).toHaveLength(1);
	});
});

afterAll(() => {
	mock.restore();
});
