import {
	type ApiPlanProcessors,
	type Product,
	productProcessorsAreSame,
} from "@autumn/shared";

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
		changed: !productProcessorsAreSame({
			left: product.processor,
			right: next.processor,
		}),
	};
};
