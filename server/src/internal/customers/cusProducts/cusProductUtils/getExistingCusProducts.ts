import { isOneOff } from "@/internal/products/productUtils.js";
import { nullish } from "@/utils/genUtils.js";
import { CusProductStatus } from "@autumn/shared";

import { FullCusProduct } from "@autumn/shared";

import { Product } from "@autumn/shared";
import { ACTIVE_STATUSES } from "../CusProductService.js";

export const getExistingCusProducts = ({
	product,
	cusProducts,
	internalEntityId,
}: {
	product: Product;
	cusProducts: FullCusProduct[];
	internalEntityId?: string | null;
}) => {
	if (!cusProducts || cusProducts.length === 0) {
		return {
			curMainProduct: undefined,
			curSameProduct: undefined,
			curScheduledProduct: undefined,
		};
	}

	let curMainProduct = cusProducts.find((cp: any) => {
		let sameGroup = cp.product.group === product.group;
		let isMain = !cp.product.is_add_on;
		let isActive =
			cp.status == CusProductStatus.Active ||
			cp.status == CusProductStatus.PastDue;

		let oneOff = isOneOff(cp.customer_prices.map((cp: any) => cp.price));

		let sameEntity = internalEntityId
			? cp.internal_entity_id === internalEntityId
			: nullish(cp.internal_entity_id);

		return sameGroup && isMain && isActive && !oneOff && sameEntity;
	});

	const curSameProduct = cusProducts!.find((cp: any) => {
		const idMatch = cp.product.id === product.id;
		const entityMatch = internalEntityId
			? cp.internal_entity_id === internalEntityId
			: nullish(cp.internal_entity_id);

		const isActive = ACTIVE_STATUSES.includes(cp.status);

		return idMatch && entityMatch;
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
