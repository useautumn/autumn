import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	type AttachParamsV1,
	type Checkout,
	CheckoutAction,
	CheckoutStatus,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const invalidationCalls: Record<string, unknown>[] = [];
let stripeDeferred = false;
let publishedSubject = false;

await mockModuleWithRestore("@/internal/billing/v2/actions", () => ({
	billingActions: {
		attach: async ({ ctx }: { ctx: AutumnContext }) => {
			if (publishedSubject) ctx.skipSubjectCacheDeletion = true;
			return {
				billingContext: {
					attachProduct: { id: "premium" },
					successUrl: "https://example.com/success",
				},
				billingResult: { stripe: { deferred: stripeDeferred } },
			};
		},
	},
}));
await mockModuleWithRestore(
	"@/internal/billing/v2/utils/billingResult/billingResultToResponse",
	() => ({
		billingResultToResponse: () => ({
			customer_id: "cus_checkout",
			required_action: false,
		}),
	}),
);
await mockModuleWithRestore(
	"@/internal/checkouts/actions/updateDbAndCache",
	() => ({ updateCheckoutDbAndCache: async () => undefined }),
);
await mockModuleWithRestore(
	"@/internal/customers/cache/fullSubject/index.js",
	() => ({
		invalidateCachedFullSubject: async (args: Record<string, unknown>) => {
			invalidationCalls.push(args);
		},
	}),
);

import { confirmCheckout } from "@/internal/checkouts/actions/confirmCheckout.js";

describe("Autumn Checkout confirmation cache refresh", () => {
	beforeEach(() => {
		invalidationCalls.length = 0;
		stripeDeferred = false;
		publishedSubject = false;
	});

	test("invalidates cached A after confirmation commits B", async () => {
		await confirmCheckout({
			ctx: {
				org: { id: "org_test" },
				env: "sandbox",
			} as AutumnContext,
			checkout: {
				id: "checkout_test",
				customer_id: "cus_checkout",
				status: CheckoutStatus.Pending,
				action: CheckoutAction.Attach,
			} as Checkout,
			params: {
				customer_id: "cus_checkout",
				entity_id: "entity_test",
				plan_id: "premium",
			} as AttachParamsV1,
		});

		expect(invalidationCalls).toEqual([
			{
				ctx: expect.anything(),
				customerId: "cus_checkout",
				entityId: "entity_test",
				source: "confirmCheckout",
			},
		]);
	});

	test("keeps A when confirmation is still deferred", async () => {
		stripeDeferred = true;

		await confirmCheckout({
			ctx: { org: { id: "org_test" }, env: "sandbox" } as AutumnContext,
			checkout: {
				id: "checkout_test",
				customer_id: "cus_checkout",
				status: CheckoutStatus.Pending,
				action: CheckoutAction.Attach,
			} as Checkout,
			params: {
				customer_id: "cus_checkout",
				plan_id: "premium",
			} as AttachParamsV1,
		});

		expect(invalidationCalls).toHaveLength(0);
	});

	test("keeps atomically published B after confirmation", async () => {
		publishedSubject = true;

		await confirmCheckout({
			ctx: { org: { id: "org_test" }, env: "sandbox" } as AutumnContext,
			checkout: {
				id: "checkout_test",
				customer_id: "cus_checkout",
				status: CheckoutStatus.Pending,
				action: CheckoutAction.Attach,
			} as Checkout,
			params: {
				customer_id: "cus_checkout",
				plan_id: "premium",
			} as AttachParamsV1,
		});

		expect(invalidationCalls).toHaveLength(0);
	});
});

afterAll(() => {
	mock.restore();
});
