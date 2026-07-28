import type { BillingContext } from "@autumn/shared";
import {
	type FullCusProduct,
	isOneOffPrice,
	type LineItem,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { storedInvoiceCreditForPrice } from "./storedInvoiceCreditForPrice";

type InvoiceMatchedCreditResult = {
	lineItems: LineItem[];
	allPricesResolved: boolean;
	resolvedPriceIds: string[];
};

export const invoiceCreditFromStoredLineItems = ({
	ctx,
	customerProduct,
	billingContext,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	billingContext: BillingContext;
}): InvoiceMatchedCreditResult => {
	const pricesToCredit = customerProduct.customer_prices.filter(
		(cp) => !isOneOffPrice(cp.price),
	);

	if (pricesToCredit.length === 0) {
		return { lineItems: [], allPricesResolved: true, resolvedPriceIds: [] };
	}

	const allLineItems: LineItem[] = [];
	const resolvedPriceIds: string[] = [];
	let anyMissed = false;

	for (const cusPrice of pricesToCredit) {
		const result = storedInvoiceCreditForPrice({
			ctx,
			customerProduct,
			billingContext,
			target: { price: cusPrice.price },
		});

		if (!result.resolved) {
			anyMissed = true;
			continue;
		}

		resolvedPriceIds.push(cusPrice.price.id);
		allLineItems.push(...result.lineItems);
	}

	if (anyMissed && allLineItems.length === 0) {
		return { lineItems: [], allPricesResolved: false, resolvedPriceIds };
	}

	return {
		lineItems: allLineItems,
		allPricesResolved: !anyMissed,
		resolvedPriceIds,
	};
};
