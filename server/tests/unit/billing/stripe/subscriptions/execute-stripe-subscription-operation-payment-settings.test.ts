import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type {
	BillingContext,
	InvoicePaymentMethod,
	StripeSubscriptionAction,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { mockModuleWithRestore } from "../../../utils/mockModuleWithRestore.js";

const mockState = {
	createCalls: [] as Stripe.SubscriptionCreateParams[],
	updateCalls: [] as Stripe.SubscriptionUpdateParams[],
};

await mockModuleWithRestore("@server/external/connect/createStripeCli", () => ({
	createStripeCli: () => ({
		subscriptions: {
			create: async (params: Stripe.SubscriptionCreateParams) => {
				mockState.createCalls.push(params);
				return { id: "sub_created" };
			},
			update: async (
				_subscriptionId: string,
				params: Stripe.SubscriptionUpdateParams,
			) => {
				mockState.updateCalls.push(params);
				return { id: "sub_updated" };
			},
		},
	}),
}));

const { executeStripeSubscriptionOperation } = await import(
	"@/internal/billing/v2/providers/stripe/utils/subscriptions/executeStripeSubscriptionOperation"
);

const ctx = {
	org: { id: "org_123", config: { automatic_tax: false } },
	env: "sandbox",
} as unknown as AutumnContext;

const makeBillingContext = ({
	invoiceMode = true,
	paymentMethodTypes,
	trialing = false,
}: {
	invoiceMode?: boolean;
	paymentMethodTypes?: InvoicePaymentMethod[];
	trialing?: boolean;
}) =>
	({
		stripeCustomer: { id: "cus_123" },
		...(trialing && {
			stripeSubscription: {
				id: "sub_123",
				status: "trialing",
				billing_mode: { type: "flexible" },
			},
			trialContext: { trialEndsAt: null },
		}),
		...(invoiceMode && {
			invoiceMode: {
				finalizeInvoice: true,
				enableProductImmediately: true,
				paymentMethodTypes,
			},
		}),
	}) as unknown as BillingContext;

const createAction = (
	params: Stripe.SubscriptionCreateParams = { customer: "cus_123" },
): StripeSubscriptionAction => ({ type: "create", params });

describe("executeStripeSubscriptionOperation payment settings", () => {
	beforeEach(() => {
		mockState.createCalls = [];
		mockState.updateCalls = [];
	});

	test("applies the resolved payment method types in invoice mode", async () => {
		await executeStripeSubscriptionOperation({
			ctx,
			billingContext: makeBillingContext({
				paymentMethodTypes: ["card", "customer_balance"],
			}),
			subscriptionAction: createAction(),
		});

		expect(mockState.createCalls[0]?.collection_method).toBe("send_invoice");
		expect(mockState.createCalls[0]?.payment_settings).toEqual({
			payment_method_types: ["card", "customer_balance"],
		});
	});

	test("sends no payment settings in invoice mode when nothing is resolved", async () => {
		await executeStripeSubscriptionOperation({
			ctx,
			billingContext: makeBillingContext({}),
			subscriptionAction: createAction(),
		});

		expect(mockState.createCalls[0]?.collection_method).toBe("send_invoice");
		expect(mockState.createCalls[0]?.payment_settings).toBeUndefined();
	});

	test("sends no payment method types outside invoice mode", async () => {
		await executeStripeSubscriptionOperation({
			ctx,
			billingContext: makeBillingContext({
				invoiceMode: false,
				paymentMethodTypes: ["card"],
			}),
			subscriptionAction: createAction(),
		});

		expect(mockState.createCalls[0]?.collection_method).toBeUndefined();
		expect(mockState.createCalls[0]?.payment_settings).toBeUndefined();
	});

	test("keeps save_default_payment_method from the custom payment method flow", async () => {
		await executeStripeSubscriptionOperation({
			ctx,
			billingContext: makeBillingContext({ paymentMethodTypes: ["card"] }),
			subscriptionAction: createAction({
				customer: "cus_123",
				payment_settings: { save_default_payment_method: "on_subscription" },
			}),
		});

		expect(mockState.createCalls[0]?.payment_settings).toEqual({
			save_default_payment_method: "on_subscription",
			payment_method_types: ["card"],
		});
	});

	test("applies payment method types on updates that create an invoice", async () => {
		await executeStripeSubscriptionOperation({
			ctx,
			billingContext: makeBillingContext({
				paymentMethodTypes: ["bacs_debit"],
				trialing: true,
			}),
			subscriptionAction: {
				type: "update",
				stripeSubscriptionId: "sub_123",
				params: {},
			},
		});

		expect(mockState.updateCalls[0]?.payment_settings).toEqual({
			payment_method_types: ["bacs_debit"],
		});
	});

	test("leaves updates that create no invoice untouched", async () => {
		await executeStripeSubscriptionOperation({
			ctx,
			billingContext: makeBillingContext({ paymentMethodTypes: ["card"] }),
			subscriptionAction: {
				type: "update",
				stripeSubscriptionId: "sub_123",
				params: {},
			},
		});

		expect(mockState.updateCalls[0]?.payment_settings).toBeUndefined();
		expect(mockState.updateCalls[0]?.collection_method).toBeUndefined();
	});
});

afterAll(() => {
	mock.restore();
});
