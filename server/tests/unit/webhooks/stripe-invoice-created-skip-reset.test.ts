import { beforeEach, describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import type Stripe from "stripe";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const getFullCalls: Array<Record<string, unknown>> = [];

await mockModuleWithRestore("@/internal/customers/CusService", () => ({
	CusService: {
		getByStripeId: async () => ({ internal_id: "customer_internal" }),
		getFull: async (args: Record<string, unknown>) => {
			getFullCalls.push(args);
			return { id: "customer_external", internal_id: "customer_internal" };
		},
	},
}));

await mockModuleWithRestore("@/external/redis/customerRedisRouting.js", () => ({
	getCtxWithCustomerRedis: ({ ctx }: { ctx: StripeWebhookContext }) => ({
		ctx,
	}),
}));

await mockModuleWithRestore("@/internal/misc/rollouts/rolloutUtils.js", () => ({
	computeRolloutSnapshot: () => undefined,
}));

const { attachStripeEventCustomer } = await import(
	// @ts-expect-error Bun cache-busting query isolates module mocks.
	"@/external/stripe/webhookMiddlewares/stripeToAutumnCustomerMiddleware.js?invoiceCreatedSkipReset"
);

const makeContext = ({ type }: { type: Stripe.Event.Type }) =>
	({
		stripeEvent: {
			id: "event_test",
			type,
			data: { object: { customer: "cus_stripe" } },
		} as Stripe.Event,
		org: { id: "org_test" },
		env: AppEnv.Sandbox,
	}) as StripeWebhookContext;

describe("Stripe customer hydration reset policy", () => {
	beforeEach(() => {
		getFullCalls.length = 0;
	});

	test("preserves the closing balance for invoice.created capture", async () => {
		await attachStripeEventCustomer({
			ctx: makeContext({ type: "invoice.created" }),
		});

		expect(getFullCalls[0]).toMatchObject({ skipReset: true });
	});

	test("keeps lazy resets enabled for other Stripe events", async () => {
		await attachStripeEventCustomer({
			ctx: makeContext({ type: "invoice.updated" }),
		});

		expect(getFullCalls[0]).toMatchObject({ skipReset: false });
	});
});
