import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv, FeatureType } from "@autumn/shared";
import type Stripe from "stripe";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const cachedFullSubjectCalls: Array<Record<string, unknown>> = [];

await mockModuleWithRestore(
	"@/internal/customers/cache/fullSubject/actions/getCachedFullSubject.js",
	() => ({
		getCachedFullSubject: async (args: Record<string, unknown>) => {
			cachedFullSubjectCalls.push(args);
			return { fullSubject: undefined, subjectViewEpoch: 0 };
		},
	}),
);

await mockModuleWithRestore(
	"@/external/stripe/invoices/operations/getStripeInvoice",
	() => ({ getStripeInvoice: async () => ({ id: "in_test" }) }),
);

await mockModuleWithRestore(
	"@/external/stripe/invoices/utils/convertStripeInvoice",
	() => ({ stripeInvoiceToStripeSubscriptionId: () => "sub_test" }),
);

await mockModuleWithRestore("@/external/stripe/subscriptions", () => ({
	getExpandedStripeSubscription: async () => ({
		id: "sub_test",
		customer: { id: "cus_stripe" },
	}),
}));

await mockModuleWithRestore(
	"@/external/stripe/subscriptions/utils/convertStripeSubscription",
	() => ({
		stripeSubscriptionToNowMs: async () => 1_000,
		stripeSubscriptionToScheduleId: () => null,
	}),
);

await mockModuleWithRestore(
	"@/external/stripe/customers/operations/getExpandedStripeCustomer",
	() => ({
		getExpandedStripeCustomer: async () => ({ id: "cus_stripe" }),
	}),
);

await mockModuleWithRestore("@/external/stripe/stripeCusUtils", () => ({
	getCusPaymentMethod: async () => null,
}));

await mockModuleWithRestore("@/internal/customers/cusProducts/actions", () => ({
	customerProductActions: {
		expiredCache: {
			getAndMerge: async ({
				customerProducts,
			}: {
				customerProducts: unknown[];
			}) => customerProducts,
		},
	},
}));

const { setupInvoiceCreatedContext } = await import(
	// @ts-expect-error Bun cache-busting query isolates module mocks.
	"@/external/stripe/webhookHandlers/handleStripeInvoiceCreated/setupInvoiceCreatedContext.js?runtimeCapture"
);

const makeCustomerProduct = ({
	invoiceCredit,
}: {
	invoiceCredit: boolean;
}) => ({
	id: "customer_product_test",
	subscription_ids: ["sub_test"],
	scheduled_ids: [],
	customer_entitlements: [
		{
			id: "customer_entitlement_test",
			entitlement: {
				feature: {
					id: invoiceCredit ? "invoice_credits" : "messages",
					type: invoiceCredit ? FeatureType.CreditSystem : FeatureType.Metered,
					config: invoiceCredit ? { invoice_credit: true } : {},
				},
			},
		},
	],
});

const makeContext = ({ invoiceCredit }: { invoiceCredit: boolean }) =>
	({
		stripeEvent: event,
		stripeCli: {},
		org: { id: "org_test" },
		env: AppEnv.Sandbox,
		features: [],
		logger: { info: () => undefined },
		fullCustomer: {
			id: "customer_test",
			internal_id: "customer_internal_test",
			customer_products: [makeCustomerProduct({ invoiceCredit })],
		},
	}) as never;

const event = {
	data: { object: { id: "in_test" } },
} as Stripe.InvoiceCreatedEvent;

describe("invoice.created runtime customer capture", () => {
	beforeEach(() => {
		cachedFullSubjectCalls.length = 0;
	});

	test("keeps classic subscriptions on the existing hydration path", async () => {
		await setupInvoiceCreatedContext({
			ctx: makeContext({ invoiceCredit: false }),
			event,
		});

		expect(cachedFullSubjectCalls).toHaveLength(0);
	});

	test("keeps invoice-credit subscriptions on the existing hydration path", async () => {
		await setupInvoiceCreatedContext({
			ctx: makeContext({ invoiceCredit: true }),
			event,
		});

		expect(cachedFullSubjectCalls).toHaveLength(0);
	});
});

afterAll(() => {
	mock.restore();
});
