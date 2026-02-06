import type { Organization } from "@models/orgModels/orgTable";
import type { Price } from "@models/productModels/priceModels/priceModels";
import type { FullProduct } from "@models/productModels/productModels";
import { orgToCurrency } from "@utils/orgUtils/convertOrgUtils";
import { priceToEnt } from "@utils/productUtils/convertProductUtils";
import { priceToStripePrepaidV2Tiers } from "@utils/productUtils/priceUtils/convertPrice/priceToStripePrepaidV2Tiers";
import { priceToStripeProductName } from "@utils/productUtils/priceUtils/convertPrice/priceToStripeProductName";
import { priceToStripeRecurringParams } from "@utils/productUtils/priceUtils/convertPrice/priceToStripeRecurringParams";
import type Stripe from "stripe";

export const priceToStripeCreatePriceParams = ({
	price,
	product,
	org,
	currentStripeProduct,
}: {
	price: Price;
	product: FullProduct;
	org: Organization;
	currentStripeProduct?: Stripe.Product;
}): Stripe.PriceCreateParams => {
	const entitlement = priceToEnt({
		price,
		entitlements: product.entitlements,
		errorOnNotFound: true,
	});

	const productName = priceToStripeProductName({
		price,
		entitlement,
		product,
	});

	const productData = currentStripeProduct
		? { product: currentStripeProduct.id }
		: {
				product_data: {
					name: productName,
				},
			};

	const tiers = priceToStripePrepaidV2Tiers({ price, entitlement, org });

	let priceAmountData = {};
	if (tiers.length === 1) {
		priceAmountData = {
			unit_amount_decimal: tiers[0].unit_amount_decimal,
		};
	} else {
		priceAmountData = {
			billing_scheme: "tiered",
			tiers_mode: "graduated",
			tiers: tiers,
		};
	}

	const recurringData = priceToStripeRecurringParams({ price });

	return {
		...productData,
		...priceAmountData,
		recurring: recurringData,
		currency: orgToCurrency({ org }),
		nickname: `Autumn Price (${entitlement.feature.name})`,
	};
};
