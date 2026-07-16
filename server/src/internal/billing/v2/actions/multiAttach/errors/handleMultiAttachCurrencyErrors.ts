import {
	ErrCode,
	isFreeProduct,
	type MultiAttachBillingContext,
	type MultiAttachParamsV0,
	orgMultiCurrencyEnabled,
	productToEffectivePrices,
	RecaseError,
	resolveCustomerCurrency,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { assertPlanOffersCurrency } from "@/internal/billing/v2/actions/attach/errors/handleCurrencyMismatchErrors";

/**
 * Blocks a multi-attach that would bill the customer in an unsupported currency.
 * Runs pre-Stripe (before evaluateStripeBillingPlan, which creates Stripe prices).
 */
export const handleMultiAttachCurrencyErrors = ({
	ctx,
	billingContext,
	params,
}: {
	ctx: AutumnContext;
	billingContext: MultiAttachBillingContext;
	params: Pick<MultiAttachParamsV0, "currency">;
}) => {
	const { fullCustomer } = billingContext;

	if (params.currency && !orgMultiCurrencyEnabled({ org: ctx.org })) {
		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			message: "Multi-currency is not enabled for this organization",
			statusCode: 400,
		});
	}

	// Free / auto-enabled plans neither need nor lock a currency.
	const allPrices = billingContext.productContexts.flatMap((productContext) =>
		productToEffectivePrices({ product: productContext.fullProduct }),
	);
	if (isFreeProduct({ prices: allPrices })) return;

	const locked =
		(
			fullCustomer.currency ?? billingContext.stripeCustomer?.currency
		)?.toLowerCase() || null;
	const requested = params.currency?.toLowerCase() || null;
	const resolved =
		billingContext.currency ??
		resolveCustomerCurrency({
			customer: fullCustomer,
			org: ctx.org,
			requested: params.currency,
			stripeCurrency: billingContext.stripeCustomer?.currency,
		});

	// A locked customer cannot switch currencies (Stripe forbids it anyway).
	if (locked && requested && requested !== locked) {
		throw new RecaseError({
			code: ErrCode.CurrencyMismatch,
			message: `Customer is locked to ${locked.toUpperCase()} and cannot be billed in ${requested.toUpperCase()}`,
			statusCode: 400,
		});
	}

	// Every charging price on every plan must offer the resolved currency (no FX fallback).
	for (const productContext of billingContext.productContexts) {
		assertPlanOffersCurrency({
			ctx,
			prices: productToEffectivePrices({
				product: productContext.fullProduct,
			}),
			planName: productContext.fullProduct.name,
			currency: resolved,
			customerConfigured: !!locked && resolved === locked,
		});
	}
};
