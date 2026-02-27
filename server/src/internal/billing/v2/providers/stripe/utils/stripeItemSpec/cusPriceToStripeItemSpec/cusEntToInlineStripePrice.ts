import {
	cusEntsToAllowance,
	cusEntToPrepaidInvoiceOverage,
	type FullCusEntWithFullCusProduct,
	InternalError,
	type Organization,
	orgToCurrency,
	priceToLineAmount,
	type StripeInlinePrice,
} from "@autumn/shared";
import { cusEntToCusPrice } from "@shared/utils/cusEntUtils/convertCusEntUtils/cusEntToCusPrice";
import { atmnToStripeAmountDecimal } from "@shared/utils/productUtils/priceUtils/convertAmountUtils";
import { priceToStripeRecurringParams } from "@shared/utils/productUtils/priceUtils/convertPrice/priceToStripeRecurringParams";

/**
 * Builds a flat inline Stripe price for an entity-scoped prepaid item.
 * Calculates the total amount using tier logic,
 * since Stripe doesn't support tiered price_data on inline prices.
 */
export const cusEntToInlineStripePrice = ({
	cusEnt,
	org,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	org: Organization;
}): StripeInlinePrice => {
	const cusPrice = cusEntToCusPrice({ cusEnt });
	if (!cusPrice) {
		throw new InternalError({
			message: `[cusEntToInlineStripePrice] No cus price found for cus ent (feature: ${cusEnt.entitlement.feature_id})`,
		});
	}

	const price = cusPrice.price;
	const recurring = priceToStripeRecurringParams({ price });
	const currency = orgToCurrency({ org });

	const productId = price.config.stripe_product_id;
	if (!productId) {
		throw new InternalError({
			message: `[cusEntToInlineStripePrice] Price ${price.id} has no stripe_product_id for inline price`,
		});
	}

	// 1. Get overage (purchased quantity in feature units
	const overage = cusEntToPrepaidInvoiceOverage({
		cusEnt,
		useUpcomingQuantity: true,
	});

	const allowance = cusEntsToAllowance({ cusEnts: [cusEnt] });

	// 4. Calculate total dollar amount using tier logic
	const totalAmount = priceToLineAmount({
		price,
		overage,
		allowance,
	});

	const totalStripeAmount = atmnToStripeAmountDecimal({
		amount: totalAmount,
		currency,
	});

	return {
		product: productId,
		currency,
		...(recurring && { recurring }),
		unit_amount_decimal: totalStripeAmount,
	};
};
