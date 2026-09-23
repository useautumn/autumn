import {
	type DbInvoiceLineItem,
	ErrCode,
	type PreviewInvoiceCredits,
	RecaseError,
	type ReissueCustomerOverrides,
	type ReissueInvoiceOverrides,
	type ReissueLineEdits,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { ExpandedStripeCustomer } from "@/external/stripe/customers/operations/getExpandedStripeCustomer";
import { getStripeInvoiceLineItems } from "@/external/stripe/invoices/lineItems/operations/getStripeInvoiceLineItems";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildReissueLines } from "./buildReissueLines";
import { previewReissuedInvoice } from "./previewReissuedInvoice";
import { resolveReissueTax } from "./resolveReissueTax";

const addressParams = ({ address }: { address?: Stripe.Address | null }) =>
	address
		? Object.fromEntries(
				Object.entries(address).map(([key, value]) => [key, value ?? ""]),
			)
		: undefined;

export const previewReissue = async ({
	ctx,
	customerId,
	stripeCli,
	stripeInvoice,
	stripeCustomer,
	overrides,
	customerOverrides,
	lineEdits,
	storedLines,
	credits,
	dueDateMs,
}: {
	ctx: AutumnContext;
	customerId: string;
	stripeCli: Stripe;
	stripeInvoice: Stripe.Invoice;
	stripeCustomer: ExpandedStripeCustomer;
	overrides?: ReissueInvoiceOverrides;
	customerOverrides?: ReissueCustomerOverrides;
	lineEdits?: ReissueLineEdits;
	storedLines: DbInvoiceLineItem[];
	credits?: PreviewInvoiceCredits;
	dueDateMs: number | null;
}) => {
	const lines = await buildReissueLines({
		ctx,
		customerId,
		stripeCli,
		stripeInvoice,
		overrides,
		lineEdits,
		storedLines,
	});
	if (lines.length > 250) {
		throw new RecaseError({
			message: "Stripe invoice previews support at most 250 lines",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	const { automaticTax, defaultTaxRates } = resolveReissueTax({
		stripeInvoice,
		overrides,
	});
	const taxIds =
		customerOverrides?.tax_ids ??
		(await stripeCli.customers
			.listTaxIds(stripeCustomer.id, { limit: 100 })
			.autoPagingToArray({ limit: 100 }));
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
		customer_details: {
			address: {
				...addressParams({
					address: stripeCustomer.address?.country
						? stripeCustomer.address
						: stripeCustomer.invoice_settings.default_payment_method
								?.billing_details.address,
				}),
				...customerOverrides?.address,
			},
			shipping: stripeCustomer.shipping?.address
				? {
						address:
							addressParams({ address: stripeCustomer.shipping.address }) ?? {},
						name: stripeCustomer.shipping.name ?? "",
						phone: stripeCustomer.shipping.phone ?? undefined,
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
		},
		invoice_items: invoiceItems,
	};
	const preview = await stripeCli.invoices.createPreview(previewParams);
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
