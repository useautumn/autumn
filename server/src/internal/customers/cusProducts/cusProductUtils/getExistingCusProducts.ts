import {
	CusProductStatus,
	type FullCusProduct,
	type Product,
	RELEVANT_STATUSES,
} from "@autumn/shared";
import { isOneOff } from "@server/internal/products/productUtils";
import { nullish } from "@server/utils/genUtils";

export const getExistingCusProducts = ({
	product,
	cusProducts,
	internalEntityId,
	// processorType = ProcessorType.Stripe,
}: {
	product: Product;
	cusProducts: FullCusProduct[];
	internalEntityId?: string | null;
	// processorType?: ProcessorType;
}) => {
	if (!cusProducts || cusProducts.length === 0 || !product) {
		return {
			curMainProduct: undefined,
			curSameProduct: undefined,
			curScheduledProduct: undefined,
		};
	}

	const curMainProduct = cusProducts.find((cp: FullCusProduct) => {
		// const sameProcessor = cp.processor?.type
		// 	? cp.processor.type === processorType
		// 	: true;
		const sameGroup = cp.product.group === product.group;
		const isMain = !cp.product.is_add_on;
		const isActive =
			cp.status === CusProductStatus.Active ||
			cp.status === CusProductStatus.PastDue;

		const oneOff = isOneOff(cp.customer_prices.map((cp: any) => cp.price));

		const sameEntity = internalEntityId
			? cp.internal_entity_id === internalEntityId
			: nullish(cp.internal_entity_id);

		return sameGroup && isMain && isActive && !oneOff && sameEntity;
	});

	const curSameProduct = cusProducts!.find((cp: any) => {
		const idMatch = cp.product.id === product.id;
		const entityMatch = internalEntityId
			? cp.internal_entity_id === internalEntityId
			: nullish(cp.internal_entity_id);

		const isRelevant = RELEVANT_STATUSES.includes(cp.status);

		return idMatch && entityMatch && isRelevant;
	});

	const curScheduledProduct = cusProducts!.find(
		(cp: any) =>
			cp.status === CusProductStatus.Scheduled &&
			cp.product.group === product.group &&
			!cp.product.is_add_on &&
			(internalEntityId
				? cp.internal_entity_id === internalEntityId
				: nullish(cp.internal_entity_id)),
	);

	return { curMainProduct, curSameProduct, curScheduledProduct };
};
