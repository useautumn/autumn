import type { ApiPlanProcessors, Product } from "@autumn/shared";

const processorsEqual = ({
	left,
	right,
}: {
	left: Product["processor"];
	right: Product["processor"];
}): boolean =>
	(left?.id ?? null) === (right?.id ?? null) &&
	JSON.stringify(left?.additional_ids ?? []) ===
		JSON.stringify(right?.additional_ids ?? []);

/** Stamp `plan.processors.stripe` onto `product.processor`. Omit keeps. */
export const applyPlanProcessorsToProduct = ({
	product,
	processors,
}: {
	product: Product;
	processors?: ApiPlanProcessors;
}): { product: Product; changed: boolean } => {
	if (processors?.stripe === undefined) {
		return { product, changed: false };
	}

	const next: Product = {
		...product,
		processor: {
			type: "stripe",
			id: processors.stripe.product_id,
			...(processors.stripe.additional_product_ids?.length
				? { additional_ids: processors.stripe.additional_product_ids }
				: {}),
		},
	};
	return {
		product: next,
		changed: !processorsEqual({
			left: product.processor,
			right: next.processor,
		}),
	};
};
