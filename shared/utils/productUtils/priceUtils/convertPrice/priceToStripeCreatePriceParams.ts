import type { Organization } from "@models/orgModels/orgTable";
import type { Price } from "@models/productModels/priceModels/priceModels";
import type { FullProduct } from "@models/productModels/productModels";
import { orgToCurrency } from "@utils/orgUtils/convertOrgUtils";
import { priceToEnt } from "@utils/productUtils/convertProductUtils";
import { priceToStripePrepaidV2Tiers } from "@utils/productUtils/priceUtils/convertPrice/priceToStripePrepaidV2Tiers";
import { priceToStripeRecurringParams } from "@utils/productUtils/priceUtils/convertPrice/priceToStripeRecurringParams";
import type Stripe from "stripe";
import {
	type StripePriceNicknameSource,
	priceToStripeNickname,
} from "./priceToStripeNickname";
import { priceToStripeTiersMode } from "./priceToStripeTiersMode";

export const priceToStripeCreatePriceParams = ({
	price,
	product,
	org,
	stripeProductId,
	currency: targetCurrency,
	source = "catalog",
}: {
	price: Price;
	product: FullProduct;
	org: Organization;
	stripeProductId: string;
	currency?: string;
	source?: StripePriceNicknameSource;
}): Stripe.PriceCreateParams => {
	const currency = (
		targetCurrency ??
		price.config.base_currency ??
		orgToCurrency({ org })
	).toLowerCase();
	const entitlement = priceToEnt({
		price,
		entitlements: product.entitlements,
		errorOnNotFound: true,
	});

	const tiers = priceToStripePrepaidV2Tiers({
		price,
		entitlement,
		org,
		currency,
	});
	const tiersMode = priceToStripeTiersMode({ price });

	let priceAmountData = {};
	if (tiers.length === 1) {
		priceAmountData = {
			unit_amount_decimal: tiers[0].unit_amount_decimal,
		};
	} else {
		priceAmountData = {
			billing_scheme: "tiered",
			tiers_mode: tiersMode,
			tiers: tiers,
		};
	}

	const recurringData = priceToStripeRecurringParams({ price });

	return {
		product: stripeProductId,
		...priceAmountData,
		recurring: recurringData,
		currency,
		nickname: priceToStripeNickname({
			price,
			featureName: entitlement.feature.name,
			source,
		}),
	};
};
