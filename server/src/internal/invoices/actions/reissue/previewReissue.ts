import {
	type DbInvoiceLineItem,
	ErrCode,
	type PreviewInvoiceCredits,
	RecaseError,
	type ReissueCustomerOverrides,
	type ReissueInvoiceOverrides,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { ExpandedStripeCustomer } from "@/external/stripe/customers/operations/getExpandedStripeCustomer";
import { getStripeInvoiceLineItems } from "@/external/stripe/invoices/lineItems/operations/getStripeInvoiceLineItems";
import { previewReissuedInvoice } from "./previewReissuedInvoice";
import { resolveReissueCustomerDetails } from "./resolveReissueCustomerDetails";
import { resolveReissueTax } from "./resolveReissueTax";

export const previewReissue = async ({
	stripeCli,
	stripeInvoice,
	stripeCustomer,
	overrides,
	customerOverrides,
	lines,
	storedLines,
	credits,
	dueDateMs,
}: {
	stripeCli: Stripe;
	stripeInvoice: Stripe.Invoice;
	stripeCustomer: ExpandedStripeCustomer;
	overrides?: ReissueInvoiceOverrides;
	customerOverrides?: ReissueCustomerOverrides;
	lines: Stripe.InvoiceAddLinesParams.Line[];
	storedLines: DbInvoiceLineItem[];
	credits?: PreviewInvoiceCredits;
	dueDateMs: number | null;
}) => {
	const { automaticTax, defaultTaxRates } = resolveReissueTax({
		stripeInvoice,
		overrides,
	});
	const invoiceItems: Stripe.InvoiceCreatePreviewParams.InvoiceItem[] =
		lines.map((line) => {
			if (line.price_data && !line.price_data.product) {
				throw new RecaseError({
					message: "Invoice preview requires an existing Stripe product",
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}
			return {
				amount: line.amount,
				currency: stripeInvoice.currency,
				description: line.description,
				discountable: line.discountable,
				discounts: line.discounts,
				metadata: line.metadata,
				period: line.period,
				price: line.pricing?.price,
				price_data: line.price_data?.product
					? { ...line.price_data, product: line.price_data.product }
					: undefined,
				quantity: line.quantity,
				...(!automaticTax
					? { tax_rates: line.tax_rates ?? defaultTaxRates }
					: {}),
			};
		});
	const previewParams: Stripe.InvoiceCreatePreviewParams = {
		currency: stripeInvoice.currency,
		automatic_tax: { enabled: automaticTax },
		discounts: "",
		customer_details: await resolveReissueCustomerDetails({
			stripeCli,
			stripeInvoice,
			stripeCustomer,
			customerOverrides,
		}),
		invoice_items: invoiceItems,
	};
	const preview = await stripeCli.invoices.createPreview(previewParams);
	if (automaticTax && preview.automatic_tax.status !== "complete") {
		throw new RecaseError({
			message:
				preview.automatic_tax.status === "requires_location_inputs"
					? "A valid customer tax location is required to preview automatic tax"
					: "Stripe could not complete the automatic tax calculation. Try again.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	return previewReissuedInvoice({
		stripeInvoice: preview,
		lines: preview.lines.has_more
			? await getStripeInvoiceLineItems({
					stripeClient: stripeCli,
					invoiceId: preview.id,
				})
			: preview.lines.data,
		storedLines,
		credits,
		dueDateMs,
	});
};
