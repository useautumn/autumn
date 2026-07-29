import type {
	CustomizePlanV1,
	FullCusProduct,
	FullCustomerPrice,
	Price,
	SharedContext,
} from "@autumn/shared";
import { basePriceToProductItem } from "@shared/api/products/components/basePrice/basePriceToProductItem";
import { customerProductToBasePrice } from "@shared/utils/cusProductUtils/convertCusProduct/customerProductToPrice";
import { itemToPriceAndEnt } from "@shared/utils/productV2Utils/productItemUtils/mappers/itemToPriceAndEnt";
import type { ReusePricesAndEntitlements } from "./types";

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

/** Replaces the customer product's base price in place. Callers surface the
 * returned prices on their product snapshot, as with the other patch handlers. */
export const handleCustomizePrice = ({
	ctx,
	customize,
	targetCustomerProduct,
	orgId,
	internalProductId,
	reusePricesAndEntitlements,
}: {
	ctx: SharedContext;
	customize: CustomizePlanV1;
	targetCustomerProduct: FullCusProduct;
	orgId: string;
	internalProductId: string;
	reusePricesAndEntitlements?: ReusePricesAndEntitlements;
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

	const overridePrice = customize.price.price_id
		? reusePricesAndEntitlements?.pricesById.get(customize.price.price_id)
		: undefined;
	let price = overridePrice;
	if (!price) {
		const item = basePriceToProductItem({
			ctx,
			basePrice: customize.price,
		});
		const { newPrice, updatedPrice } = itemToPriceAndEnt({
			item,
			orgId,
			internalProductId,
			isCustom: true,
			features: ctx.features,
		});
		price = newPrice ?? updatedPrice ?? undefined;
	}
	const prices = price ? [price] : [];

	return { customerPrices, prices };
};
