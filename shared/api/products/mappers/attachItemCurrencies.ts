import { RecaseError } from "@api/errors/base/RecaseError";
import { ProductErrorCode } from "@api/errors/codes/productErrCodes";
import type { ApiPlanItemV1 } from "@api/products/items/apiPlanItemV1";
import type { CreatePlanItemParamsV1 } from "@api/products/items/crud/createPlanItemParamsV1";
import type { ProductItem } from "@models/productV2Models/productItemModels/productItemModels";
import type { SharedContext } from "../../../types/sharedContext";

const toKey = (currency: string) => currency.toLowerCase();

/**
 * V1-layer: read additional_currencies off the original plan item and attach
 * them onto the built ProductItem (per-tier amounts merged by index), stamping
 * base_currency only when currencies are present. Validates here (we have ctx)
 * that no additional currency equals the base, and that each currency tier's
 * flat_amount shape mirrors the base tier.
 *
 * Deliberately NOT done in the V0 hop: ApiPlanItemV0 is part of the public
 * apiPlanV0 response and planItemV1ToV0 is reused by the V1->V0 downgrade.
 */
export const attachItemCurrencies = ({
	ctx,
	productItem,
	planItem,
}: {
	ctx: SharedContext;
	productItem: ProductItem;
	planItem: ApiPlanItemV1 | CreatePlanItemParamsV1;
}): ProductItem => {
	const price = planItem.price;
	if (!price) {
		return productItem;
	}

	const flatCurrencies = price.additional_currencies;
	const tierCurrenciesPresent = price.tiers?.some(
		(tier) => (tier.additional_currencies?.length ?? 0) > 0,
	);

	if (!flatCurrencies?.length && !tierCurrenciesPresent) {
		return productItem;
	}

	const baseCurrency = toKey(ctx.org.default_currency || "usd");

	const assertNotBaseCurrency = (currency: string) => {
		if (toKey(currency) === baseCurrency) {
			throw new RecaseError({
				message: `additional_currencies cannot include the base currency '${baseCurrency}' (feature: ${planItem.feature_id})`,
				code: ProductErrorCode.InvalidProductItem,
				statusCode: 400,
			});
		}
	};

	if (flatCurrencies?.length) {
		for (const { currency } of flatCurrencies) {
			assertNotBaseCurrency(currency);
		}
		return {
			...productItem,
			additional_currencies: flatCurrencies,
			base_currency: baseCurrency,
		};
	}

	const baseTiers = productItem.tiers ?? [];
	const v1Tiers = price.tiers ?? [];
	const tiers = baseTiers.map((baseTier, index) => {
		const currencyEntries = v1Tiers[index]?.additional_currencies ?? [];
		const baseHasFlat = baseTier.flat_amount != null;
		for (const entry of currencyEntries) {
			assertNotBaseCurrency(entry.currency);
			if ((entry.flat_amount != null) !== baseHasFlat) {
				throw new RecaseError({
					message: `additional currency '${entry.currency}' tier must ${baseHasFlat ? "" : "not "}use flat_amount to match the base tier (feature: ${planItem.feature_id})`,
					code: ProductErrorCode.InvalidProductItem,
					statusCode: 400,
				});
			}
		}
		return { ...baseTier, additional_currencies: currencyEntries };
	});

	return {
		...productItem,
		tiers,
		base_currency: baseCurrency,
	};
};
