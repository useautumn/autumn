import {
	customerProductHasRelevantStatus,
	type FullCusProduct,
	ProcessorType,
} from "@autumn/shared";
import type { DestinationRevenueCatItems } from "./listDestinationRevenueCatProducts";

const isRevenueCatProduct = (cusProduct: FullCusProduct) =>
	cusProduct.processor?.type === ProcessorType.RevenueCat;

const rcItemNowBelongsToDestination = ({
	cusProduct,
	destination,
}: {
	cusProduct: FullCusProduct;
	destination: DestinationRevenueCatItems;
}) => {
	const rcItemId = cusProduct.processor?.id;
	if (rcItemId) return destination.rcItemIds.has(rcItemId);
	return destination.autumnProductIds.has(cusProduct.product.id);
};

export const selectTransferredCusProducts = ({
	sourceCusProducts,
	destination,
}: {
	sourceCusProducts: FullCusProduct[];
	destination: DestinationRevenueCatItems;
}) =>
	sourceCusProducts.filter(
		(cusProduct) =>
			isRevenueCatProduct(cusProduct) &&
			customerProductHasRelevantStatus(cusProduct) &&
			rcItemNowBelongsToDestination({ cusProduct, destination }),
	);
