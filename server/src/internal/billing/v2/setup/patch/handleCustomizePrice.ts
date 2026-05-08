import type {
	CustomizePlanV1,
	FullCusProduct,
	FullCustomerPrice,
	FullProduct,
	Price,
	SharedContext,
} from "@autumn/shared";
import { basePriceToProductItem } from "@shared/api/products/components/basePrice/basePriceToProductItem";
import { customerProductToBasePrice } from "@shared/utils/cusProductUtils/convertCusProduct/customerProductToPrice";
import { itemToPriceAndEnt } from "@shared/utils/productV2Utils/productItemUtils/mappers/itemToPriceAndEnt";

const removeCurrentBasePrice = ({
	targetCustomerProduct,
}: {
	targetCustomerProduct: FullCusProduct;
}): FullCustomerPrice[] => {
	const basePrice = customerProductToBasePrice({
		customerProduct: targetCustomerProduct,
		errorOnNotFound: false,
	});
	if (!basePrice) return [];

	const customerPrices = targetCustomerProduct.customer_prices.filter(
		(customerPrice) => customerPrice.price.id === basePrice.id,
	);
	const customerPriceIds = new Set(
		customerPrices.map((customerPrice) => customerPrice.id),
	);

	targetCustomerProduct.customer_prices =
		targetCustomerProduct.customer_prices.filter(
			(customerPrice) => !customerPriceIds.has(customerPrice.id),
		);

	return customerPrices;
};

export const handleCustomizePrice = ({
	ctx,
	customize,
	targetCustomerProduct,
	fullProduct,
}: {
	ctx: SharedContext;
	customize: CustomizePlanV1;
	targetCustomerProduct: FullCusProduct;
	fullProduct: FullProduct;
}): {
	customerPrices: FullCustomerPrice[];
	prices: Price[];
} => {
	if (customize.price === undefined) {
		return { customerPrices: [], prices: [] };
	}

	const customerPrices = removeCurrentBasePrice({ targetCustomerProduct });

	if (customize.price === null) {
		return { customerPrices, prices: [] };
	}

	const item = basePriceToProductItem({
		ctx,
		basePrice: customize.price,
	});
	const { newPrice, updatedPrice } = itemToPriceAndEnt({
		item,
		orgId: fullProduct.org_id,
		internalProductId: fullProduct.internal_id,
		isCustom: true,
		features: ctx.features,
	});
	const price = newPrice ?? updatedPrice;
	const prices = price ? [price] : [];

	fullProduct.prices.push(...prices);

	return { customerPrices, prices };
};
