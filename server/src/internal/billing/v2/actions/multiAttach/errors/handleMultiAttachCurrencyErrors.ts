import {
	billingContextToCurrency,
	type MultiAttachBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { assertPlanOffersCurrency } from "@/internal/billing/v2/actions/attach/errors/handleCurrencyMismatchErrors";

export const handleMultiAttachCurrencyErrors = ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: MultiAttachBillingContext;
}) => {
	const currency = billingContextToCurrency({ org: ctx.org, billingContext });

	for (const productContext of billingContext.productContexts) {
		assertPlanOffersCurrency({
			ctx,
			prices: productContext.fullProduct.prices,
			planName: productContext.fullProduct.name,
			currency,
		});
	}
};
