import {
	type ApiPlanProcessors,
	type Product,
	productProcessorsAreSame,
} from "@autumn/shared";

/** Stamp `plan.processors.stripe` onto `product.processor`. Omit keeps, null unlinks. */
export const applyPlanProcessorsToProduct = ({
	product,
	processors,
}: {
	product: Product;
	processors?: ApiPlanProcessors;
}): { product: Product; changed: boolean } => {
	const stripe = processors?.stripe;
	if (stripe === undefined) {
		return { product, changed: false };
	}

	const next: Product = {
		...product,
		processor:
			stripe === null
				? null
				: {
						type: "stripe",
						id: stripe.product_id,
						...(stripe.additional_product_ids?.length
							? { additional_ids: stripe.additional_product_ids }
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
