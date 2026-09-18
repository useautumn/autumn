import type {
	CreateInvoiceParams,
	InvoicePlanParams,
	LineItem,
} from "@autumn/shared";
import { atmnToStripeAmount } from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeInvoiceLines } from "../create/compute/computeInvoiceLines";
import { setupCreateInvoiceContext } from "../create/setup/setupCreateInvoiceContext";

const lineItemToStripeLine = ({
	lineItem,
	currency,
}: {
	lineItem: LineItem;
	currency: string;
}): Stripe.InvoiceAddLinesParams.Line => ({
	description: lineItem.description,
	amount: atmnToStripeAmount({
		amount: lineItem.amountAfterDiscounts ?? lineItem.amount,
		currency,
	}),
	discountable: false,
	...(lineItem.context.effectivePeriod
		? {
				period: {
					start: Math.floor(lineItem.context.effectivePeriod.start / 1000),
					end: Math.floor(lineItem.context.effectivePeriod.end / 1000),
				},
			}
		: {}),
});

/**
 * Prices catalog plans added to a reissue exactly as invoices.create would,
 * so the same plan costs the same whichever endpoint bills it.
 */
export const computeReissueCatalogLines = async ({
	ctx,
	customerId,
	currency,
	plans,
}: {
	ctx: AutumnContext;
	customerId: string;
	currency: string;
	plans: InvoicePlanParams[];
}): Promise<Stripe.InvoiceAddLinesParams.Line[]> => {
	if (plans.length === 0) return [];

	const params: CreateInvoiceParams = {
		customer_id: customerId,
		currency,
		plans,
	} as CreateInvoiceParams;

	const invoiceContext = await setupCreateInvoiceContext({
		ctx,
		params,
		preview: true,
	});
	return computeInvoiceLines({ ctx, invoiceContext }).map(({ lineItem }) =>
		lineItemToStripeLine({ lineItem, currency }),
	);
};
