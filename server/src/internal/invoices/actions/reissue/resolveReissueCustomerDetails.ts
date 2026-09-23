import type { ReissueCustomerOverrides } from "@autumn/shared";
import type Stripe from "stripe";
import type { ExpandedStripeCustomer } from "@/external/stripe/customers/operations/getExpandedStripeCustomer";
import { stripeInvoiceToStripeSubscriptionId } from "@/external/stripe/invoices/utils/convertStripeInvoice";

const addressParams = ({ address }: { address?: Stripe.Address | null }) =>
	address
		? Object.fromEntries(
				Object.entries(address).map(([key, value]) => [key, value ?? ""]),
			)
		: undefined;

const resolvePaymentMethodAddress = async ({
	stripeCli,
	stripeInvoice,
	stripeCustomer,
}: {
	stripeCli: Stripe;
	stripeInvoice: Stripe.Invoice;
	stripeCustomer: ExpandedStripeCustomer;
}) => {
	const subscriptionId = stripeInvoiceToStripeSubscriptionId(stripeInvoice);
	const subscription = subscriptionId
		? await stripeCli.subscriptions.retrieve(subscriptionId, {
				expand: ["default_payment_method"],
			})
		: undefined;
	const defaultPaymentMethod =
		subscription?.default_payment_method ??
		stripeCustomer.invoice_settings.default_payment_method;
	const paymentMethod =
		typeof defaultPaymentMethod === "string"
			? await stripeCli.paymentMethods.retrieve(defaultPaymentMethod)
			: defaultPaymentMethod;
	const address = addressParams({
		address: paymentMethod?.billing_details.address,
	});
	const country = address?.country || paymentMethod?.card?.country;
	return country ? { ...address, country } : address;
};

export const resolveReissueCustomerDetails = async ({
	stripeCli,
	stripeInvoice,
	stripeCustomer,
	customerOverrides,
}: {
	stripeCli: Stripe;
	stripeInvoice: Stripe.Invoice;
	stripeCustomer: ExpandedStripeCustomer;
	customerOverrides?: ReissueCustomerOverrides;
}): Promise<Stripe.InvoiceCreatePreviewParams.CustomerDetails> => {
	const taxIds =
		customerOverrides?.tax_ids ??
		(await stripeCli.customers
			.listTaxIds(stripeCustomer.id, { limit: 100 })
			.autoPagingToArray({ limit: 100 }));
	const savedAddress = addressParams({ address: stripeCustomer.address });
	const hasAddressOverride =
		Object.keys(customerOverrides?.address ?? {}).length > 0;
	const billingAddress =
		savedAddress || hasAddressOverride
			? { ...savedAddress, ...customerOverrides?.address }
			: undefined;
	const shipping = stripeCustomer.shipping;
	const address =
		shipping?.address || billingAddress
			? billingAddress
			: await resolvePaymentMethodAddress({
					stripeCli,
					stripeInvoice,
					stripeCustomer,
				});
	return {
		address,
		shipping: shipping?.address
			? {
					address: addressParams({ address: shipping.address }) ?? {},
					name: shipping.name ?? "",
					phone: shipping.phone ?? undefined,
				}
			: undefined,
		tax_exempt: stripeCustomer.tax_exempt ?? "none",
		tax: stripeCustomer.tax?.ip_address
			? { ip_address: stripeCustomer.tax.ip_address }
			: undefined,
		tax_ids: taxIds.map((taxId) => ({
			type: taxId.type as Stripe.InvoiceCreatePreviewParams.CustomerDetails.TaxId.Type,
			value: taxId.value,
		})),
	};
};
