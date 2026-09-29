import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const stripeState = {
	cancelError: undefined as (Error & { code?: string }) | undefined,
	retrievedStatus: "incomplete" as Stripe.Subscription.Status,
};
const loggedErrors: string[] = [];

await mockModuleWithRestore("@server/external/connect/createStripeCli", () => ({
	createStripeCli: () => ({
		subscriptions: {
			cancel: async (id: string) => {
				if (stripeState.cancelError) throw stripeState.cancelError;
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
		replacedSubscriptionAction: {
			type: "cancel",
			stripeSubscriptionId: "sub_old",
		},
	});

const stripeError = (code?: string) =>
	Object.assign(new Error("stripe rejected the cancel"), { code });

describe("executeStripeReplacedSubscriptionAction", () => {
	beforeEach(() => {
		stripeState.cancelError = undefined;
		stripeState.retrievedStatus = "incomplete";
		loggedErrors.length = 0;
	});

	test("a subscription another request already cancelled counts as cancelled", async () => {
		stripeState.cancelError = stripeError();
		stripeState.retrievedStatus = "canceled";

		await cancelReplaced();

		expect(loggedErrors).toEqual([]);
	});

	test("a subscription Stripe no longer has counts as cancelled", async () => {
		stripeState.cancelError = stripeError("resource_missing");

		await cancelReplaced();

		expect(loggedErrors).toEqual([]);
	});

	test("a failed cancel is logged and doesn't stop the new plan applying", async () => {
		stripeState.cancelError = stripeError();

		await cancelReplaced();

		expect(loggedErrors).toHaveLength(1);
		expect(loggedErrors[0]).toContain("sub_old");
	});
});

afterAll(() => {
	mock.restore();
});
