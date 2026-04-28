import { expect, mock, test } from "bun:test";
import { BillingVersion } from "@autumn/shared";

type CreateInvoiceParams = Record<string, unknown>;

const mockState = {
	createCalls: [] as CreateInvoiceParams[],
};

mock.module("@/external/connect/createStripeCli", () => ({
	createStripeCli: () => ({
		invoices: {
			create: async (params: CreateInvoiceParams) => {
				mockState.createCalls.push(params);
				return { id: "in_manual_draft", status: "draft" };
			},
			addLines: async () => ({ id: "in_manual_draft", status: "draft" }),
			finalizeInvoice: async () => ({ id: "in_manual_draft", status: "open" }),
			pay: async () => ({ id: "in_manual_draft", status: "paid" }),
		},
	}),
}));

import { createInvoiceForBilling } from "@/internal/billing/v2/providers/stripe/utils/invoices/createInvoiceForBilling";

const createManualInvoice = async ({
	customerId,
	subscriptionId,
	paymentMethodTypes,
	paymentMethodOptions,
}: {
	customerId: string;
	subscriptionId: string;
	paymentMethodTypes?: string[];
	paymentMethodOptions?: Record<string, unknown>;
}) => {
	await createInvoiceForBilling({
		ctx: {
			org: { id: "org_123" },
			env: "sandbox",
		} as never,
		billingContext: {
			currentEpochMs: Date.now(),
			billingCycleAnchorMs: "now",
			resetCycleAnchorMs: "now",
			billingVersion: BillingVersion.V2,
			fullCustomer: {},
			fullProducts: [],
			featureQuantities: [],
			stripeCustomer: { id: customerId },
			stripeSubscription: {
				id: subscriptionId,
				payment_settings: paymentMethodTypes || paymentMethodOptions
					? {
							payment_method_types: paymentMethodTypes,
							payment_method_options: paymentMethodOptions,
						}
					: undefined,
			},
			paymentMethod: { id: "pm_card_123" },
		} as never,
		stripeInvoiceAction: {
			addLineParams: {
				lines: [{ amount: 1000, description: "Manual charge" }],
			},
		},
	});
};

const createCallsForCustomer = (customerId: string) =>
	mockState.createCalls.filter((call) => call.customer === customerId);

const latestCreateCallForCustomer = (customerId: string) => {
	const createCalls = createCallsForCustomer(customerId);
	return createCalls[createCalls.length - 1];
};

test.concurrent("manual invoices inherit subscription payment method types", async () => {
	const customerId = "cus_manual_payment_settings";
	await createManualInvoice({
		customerId,
		subscriptionId: "sub_manual_payment_settings",
		paymentMethodTypes: ["card", "customer_balance"],
		paymentMethodOptions: {
			customer_balance: {
				funding_type: "bank_transfer",
				bank_transfer: { type: "us_bank_account" },
			},
		},
	});

	expect(latestCreateCallForCustomer(customerId)).toMatchObject({
		customer: customerId,
		subscription: "sub_manual_payment_settings",
		payment_settings: {
			payment_method_types: ["card", "customer_balance"],
			payment_method_options: {
				customer_balance: {
					funding_type: "bank_transfer",
					bank_transfer: { type: "us_bank_account" },
				},
			},
		},
	});
});

test.concurrent("manual invoices use current subscription payment method types", async () => {
	const customerId = "cus_manual_current_settings";

	await createManualInvoice({
		customerId,
		subscriptionId: "sub_manual_current_settings",
		paymentMethodTypes: ["card", "customer_balance"],
	});
	await createManualInvoice({
		customerId,
		subscriptionId: "sub_manual_current_settings",
		paymentMethodTypes: ["card"],
	});

	const createCalls = createCallsForCustomer(customerId);
	expect(createCalls).toHaveLength(2);
	expect(createCalls[0]).toMatchObject({
		payment_settings: {
			payment_method_types: ["card", "customer_balance"],
		},
	});
	expect(createCalls[1]).toMatchObject({
		payment_settings: {
			payment_method_types: ["card"],
		},
	});
	expect(
		(
			createCalls[1].payment_settings as {
				payment_method_types: string[];
			}
		).payment_method_types,
	).not.toContain("customer_balance");
});

test.concurrent("manual invoices omit payment settings when subscription has none", async () => {
	const customerId = "cus_manual_no_payment_settings";
	await createManualInvoice({
		customerId,
		subscriptionId: "sub_manual_no_payment_settings",
	});

	expect(latestCreateCallForCustomer(customerId)).toMatchObject({
		customer: customerId,
		subscription: "sub_manual_no_payment_settings",
	});
	expect(latestCreateCallForCustomer(customerId)).not.toHaveProperty(
		"payment_settings",
	);
});
