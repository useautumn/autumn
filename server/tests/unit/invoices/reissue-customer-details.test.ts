import { describe, expect, mock, test } from "bun:test";
import Stripe from "stripe";
import type { ExpandedStripeCustomer } from "@/external/stripe/customers/operations/getExpandedStripeCustomer";
import { resolveReissueCustomerDetails } from "@/internal/invoices/actions/reissue/resolveReissueCustomerDetails";

const address = (values: Partial<Stripe.Address> = {}): Stripe.Address => ({
	city: null,
	country: null,
	line1: null,
	line2: null,
	postal_code: null,
	state: null,
	...values,
});

const paymentMethod = ({
	billingAddress = null,
	cardCountry,
}: {
	billingAddress?: Stripe.Address | null;
	cardCountry?: string;
} = {}) =>
	({
		id: "pm_test",
		billing_details: { address: billingAddress },
		...(cardCountry ? { card: { country: cardCountry } } : {}),
	}) as Stripe.PaymentMethod;

const customer = ({
	billingAddress = null,
	defaultPaymentMethod = null,
	shipping = null,
}: {
	billingAddress?: Stripe.Address | null;
	defaultPaymentMethod?: Stripe.PaymentMethod | null;
	shipping?: Stripe.Customer.Shipping | null;
} = {}) =>
	({
		id: "cus_test",
		address: billingAddress,
		shipping,
		invoice_settings: { default_payment_method: defaultPaymentMethod },
		tax_exempt: "none",
		tax: { ip_address: "203.0.113.1" },
	}) as ExpandedStripeCustomer;

const invoice = ({ subscriptionId }: { subscriptionId?: string } = {}) =>
	({
		default_payment_method: "pm_original_invoice",
		parent: subscriptionId
			? { subscription_details: { subscription: subscriptionId } }
			: null,
	}) as Stripe.Invoice;

const stripeMocks = ({
	defaultPaymentMethod = null,
}: {
	defaultPaymentMethod?: Stripe.PaymentMethod | string | null;
} = {}) => {
	const retrieveSubscription = mock(async () => ({
		default_payment_method: defaultPaymentMethod,
	}));
	const listTaxIds = mock(() => ({
		autoPagingToArray: mock(async () => [
			{ type: "eu_vat", value: "DE123456789" },
		]),
	}));
	const updateCustomer = mock();
	const createTaxId = mock();
	const deleteTaxId = mock();
	const createInvoice = mock();
	const updateSubscription = mock();
	const retrievePaymentMethod = mock(async () =>
		paymentMethod({ billingAddress: address({ country: "FR" }) }),
	);
	const stripeCli = Object.assign(new Stripe("sk_test_unit"), {
		customers: { listTaxIds, update: updateCustomer, createTaxId, deleteTaxId },
		subscriptions: {
			retrieve: retrieveSubscription,
			update: updateSubscription,
		},
		invoices: { create: createInvoice },
		paymentMethods: { retrieve: retrievePaymentMethod },
	});
	return {
		stripeCli,
		retrieveSubscription,
		listTaxIds,
		updateCustomer,
		createTaxId,
		deleteTaxId,
		createInvoice,
		updateSubscription,
		retrievePaymentMethod,
	};
};

describe("reissue preview customer details", () => {
	test("preserves invalid-present billing instead of using a payment method", async () => {
		const { stripeCli, retrieveSubscription } = stripeMocks();
		const details = await resolveReissueCustomerDetails({
			stripeCli,
			stripeInvoice: invoice({ subscriptionId: "sub_test" }),
			stripeCustomer: customer({
				billingAddress: address({ postal_code: "90210" }),
				defaultPaymentMethod: paymentMethod({
					billingAddress: address({ country: "GB" }),
				}),
			}),
		});
		expect(details.address).toMatchObject({
			country: "",
			postal_code: "90210",
		});
		expect(retrieveSubscription).not.toHaveBeenCalled();
	});

	test("merges unsaved overrides onto saved billing before selecting fallback", async () => {
		const { stripeCli, retrieveSubscription } = stripeMocks();
		const stripeCustomer = customer({
			billingAddress: address({
				postal_code: "90210",
				line1: "123 Example St",
			}),
			defaultPaymentMethod: paymentMethod({
				billingAddress: address({ country: "GB", postal_code: "SW1A 1AA" }),
			}),
		});
		const before = structuredClone(stripeCustomer);
		const details = await resolveReissueCustomerDetails({
			stripeCli,
			stripeInvoice: invoice({ subscriptionId: "sub_test" }),
			stripeCustomer,
			customerOverrides: { address: { country: "US" } },
		});
		expect(details.address).toMatchObject({
			country: "US",
			postal_code: "90210",
			line1: "123 Example St",
		});
		expect(stripeCustomer).toEqual(before);
		expect(retrieveSubscription).not.toHaveBeenCalled();
	});

	test("does not complete unsaved billing overrides with a card address", async () => {
		const { stripeCli, retrieveSubscription } = stripeMocks();
		const details = await resolveReissueCustomerDetails({
			stripeCli,
			stripeInvoice: invoice({ subscriptionId: "sub_test" }),
			stripeCustomer: customer({
				defaultPaymentMethod: paymentMethod({
					billingAddress: address({ country: "GB" }),
				}),
			}),
			customerOverrides: { address: { postal_code: "90210" } },
		});
		expect(details.address).toEqual({ postal_code: "90210" });
		expect(retrieveSubscription).not.toHaveBeenCalled();
	});

	test("preserves invalid shipping ahead of billing and payment method fallback", async () => {
		const { stripeCli, retrieveSubscription } = stripeMocks();
		const details = await resolveReissueCustomerDetails({
			stripeCli,
			stripeInvoice: invoice({ subscriptionId: "sub_test" }),
			stripeCustomer: customer({
				shipping: {
					address: address({ postal_code: "90210" }),
					name: "Example",
					phone: null,
				},
			}),
			customerOverrides: { address: { country: "GB" } },
		});
		expect(details.shipping).toMatchObject({
			address: { country: "", postal_code: "90210" },
			name: "Example",
		});
		expect(details.address).toEqual({ country: "GB" });
		expect(retrieveSubscription).not.toHaveBeenCalled();
	});

	test("uses subscription default payment method ahead of customer and ignores original invoice default", async () => {
		const { stripeCli, retrieveSubscription } = stripeMocks({
			defaultPaymentMethod: paymentMethod({
				billingAddress: address({ country: "FR" }),
			}),
		});
		const details = await resolveReissueCustomerDetails({
			stripeCli,
			stripeInvoice: invoice({ subscriptionId: "sub_test" }),
			stripeCustomer: customer({
				defaultPaymentMethod: paymentMethod({
					billingAddress: address({ country: "GB" }),
				}),
			}),
		});
		expect(details.address).toMatchObject({ country: "FR" });
		expect(retrieveSubscription).toHaveBeenCalledWith("sub_test", {
			expand: ["default_payment_method"],
		});
	});

	test("falls back to the customer default when subscription has none", async () => {
		const { stripeCli } = stripeMocks();
		const details = await resolveReissueCustomerDetails({
			stripeCli,
			stripeInvoice: invoice({ subscriptionId: "sub_test" }),
			stripeCustomer: customer({
				defaultPaymentMethod: paymentMethod({
					billingAddress: address({ country: "GB" }),
				}),
			}),
		});
		expect(details.address).toMatchObject({ country: "GB" });
	});

	test("resolves an unexpanded subscription payment method without writes", async () => {
		const { stripeCli, retrievePaymentMethod } = stripeMocks({
			defaultPaymentMethod: "pm_subscription",
		});
		const details = await resolveReissueCustomerDetails({
			stripeCli,
			stripeInvoice: invoice({ subscriptionId: "sub_test" }),
			stripeCustomer: customer(),
		});
		expect(details.address).toMatchObject({ country: "FR" });
		expect(retrievePaymentMethod).toHaveBeenCalledWith("pm_subscription");
	});

	test("an empty override does not hide the customer payment method fallback", async () => {
		const { stripeCli } = stripeMocks();
		const details = await resolveReissueCustomerDetails({
			stripeCli,
			stripeInvoice: invoice(),
			stripeCustomer: customer({
				defaultPaymentMethod: paymentMethod({
					billingAddress: address({ country: "GB" }),
				}),
			}),
			customerOverrides: { address: {} },
		});
		expect(details.address).toMatchObject({ country: "GB" });
	});

	test("infers subscription card country when the billing address is absent", async () => {
		const { stripeCli } = stripeMocks({
			defaultPaymentMethod: paymentMethod({ cardCountry: "FR" }),
		});
		const details = await resolveReissueCustomerDetails({
			stripeCli,
			stripeInvoice: invoice({ subscriptionId: "sub_test" }),
			stripeCustomer: customer({
				defaultPaymentMethod: paymentMethod({
					billingAddress: address({ country: "GB" }),
				}),
			}),
		});
		expect(details.address).toEqual({ country: "FR" });
	});

	test("infers card country while preserving payment method postal code", async () => {
		const { stripeCli, retrieveSubscription } = stripeMocks();
		const details = await resolveReissueCustomerDetails({
			stripeCli,
			stripeInvoice: invoice(),
			stripeCustomer: customer({
				defaultPaymentMethod: paymentMethod({
					billingAddress: address({ postal_code: "90210" }),
					cardCountry: "US",
				}),
			}),
		});
		expect(details.address).toMatchObject({
			country: "US",
			postal_code: "90210",
		});
		expect(retrieveSubscription).not.toHaveBeenCalled();
	});

	test("uses explicit payment method country instead of card issuer country", async () => {
		const { stripeCli } = stripeMocks();
		const details = await resolveReissueCustomerDetails({
			stripeCli,
			stripeInvoice: invoice(),
			stripeCustomer: customer({
				defaultPaymentMethod: paymentMethod({
					billingAddress: address({ country: "GB" }),
					cardCountry: "US",
				}),
			}),
		});
		expect(details.address).toMatchObject({ country: "GB" });
	});

	test("preserves IP tax location when no addresses or payment methods exist", async () => {
		const { stripeCli } = stripeMocks();
		const details = await resolveReissueCustomerDetails({
			stripeCli,
			stripeInvoice: invoice(),
			stripeCustomer: customer(),
		});
		expect(details.address).toBeUndefined();
		expect(details.tax).toEqual({ ip_address: "203.0.113.1" });
	});

	test("reads saved tax IDs without writes and preserves tax exemption", async () => {
		const mocks = stripeMocks();
		const details = await resolveReissueCustomerDetails({
			stripeCli: mocks.stripeCli,
			stripeInvoice: invoice(),
			stripeCustomer: { ...customer(), tax_exempt: "reverse" },
		});
		expect(details.tax_ids).toEqual([{ type: "eu_vat", value: "DE123456789" }]);
		expect(details.tax_exempt).toBe("reverse");
		expect(mocks.listTaxIds).toHaveBeenCalledWith("cus_test", { limit: 100 });
		for (const write of [
			mocks.updateCustomer,
			mocks.createTaxId,
			mocks.deleteTaxId,
			mocks.createInvoice,
			mocks.updateSubscription,
		]) {
			expect(write).not.toHaveBeenCalled();
		}
	});

	test("uses unsaved tax ID replacements including an explicit empty list without writes", async () => {
		for (const taxIds of [
			[],
			[{ type: "eu_vat" as const, value: "DE987654321" }],
		]) {
			const mocks = stripeMocks();
			const details = await resolveReissueCustomerDetails({
				stripeCli: mocks.stripeCli,
				stripeInvoice: invoice(),
				stripeCustomer: customer(),
				customerOverrides: { tax_ids: taxIds, address: { country: "GB" } },
			});
			expect(details.tax_ids).toEqual(taxIds);
			expect(mocks.listTaxIds).not.toHaveBeenCalled();
			for (const write of [
				mocks.updateCustomer,
				mocks.createTaxId,
				mocks.deleteTaxId,
				mocks.createInvoice,
				mocks.updateSubscription,
			]) {
				expect(write).not.toHaveBeenCalled();
			}
		}
	});
});
