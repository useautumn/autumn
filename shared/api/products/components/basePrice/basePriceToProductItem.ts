import { RecaseError } from "@api/errors/base/RecaseError";
import { ProductErrorCode } from "@api/errors/codes/productErrCodes";
import type {
	BasePrice,
	BasePriceParams,
} from "@api/products/components/basePrice/basePrice";
import { BillingInterval } from "@models/productModels/intervals/billingInterval";
import {
	type ProductItem,
	ProductItemType,
} from "@models/productV2Models/productItemModels/productItemModels";
import { getProductItemDisplay } from "@utils/productDisplayUtils";
import { billingToItemInterval } from "@utils/productV2Utils/productItemUtils/itemIntervalUtils";
import type { SharedContext } from "../../../../types/sharedContext";

export const basePriceToProductItem = ({
	ctx,
	basePrice,
}: {
	ctx: SharedContext;
	basePrice: BasePrice | BasePriceParams;
}): ProductItem => {
	const basePriceDisplay =
		"display" in basePrice ? basePrice.display : undefined;

	const entitlementId =
		"entitlement_id" in basePrice
			? (basePrice.entitlement_id ?? undefined)
			: undefined;
	const priceId =
		"price_id" in basePrice ? (basePrice.price_id ?? undefined) : undefined;

	const additionalCurrencies =
		"additional_currencies" in basePrice
			? basePrice.additional_currencies
			: undefined;
	const explicitBaseCurrency =
		"base_currency" in basePrice
			? basePrice.base_currency?.toLowerCase()
			: undefined;

	const baseCurrency =
		explicitBaseCurrency ??
		(additionalCurrencies?.length
			? (ctx.org.default_currency || "usd").toLowerCase()
			: undefined);

	if (baseCurrency) {
		for (const { currency } of additionalCurrencies ?? []) {
			if (currency.toLowerCase() === baseCurrency) {
				throw new RecaseError({
					message: `Base price additional_currencies cannot include the base currency '${baseCurrency}'`,
					code: ProductErrorCode.InvalidProductItem,
					statusCode: 400,
				});
			}
		}
	}

	const item = {
		type: ProductItemType.Price,
		feature_id: null,
		feature: null,
		interval: billingToItemInterval({
			billingInterval: basePrice.interval ?? BillingInterval.Month,
		}),
		interval_count: basePrice.interval_count ?? 1,
		price: basePrice.amount ?? 0,

		...(baseCurrency
			? {
					additional_currencies: additionalCurrencies,
					base_currency: baseCurrency,
				}
			: {}),

		entitlement_id: entitlementId,
		price_id: priceId,
	} satisfies ProductItem;

	const display = basePriceDisplay
		? getProductItemDisplay({
				item,
				features: ctx.features,
				currency: ctx.org.default_currency ?? undefined,
			})
		: undefined;

	return {
		...item,
		display,
	};
};
