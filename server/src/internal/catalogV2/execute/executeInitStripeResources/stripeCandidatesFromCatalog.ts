import type { FullProduct } from "@autumn/shared";

const nestedProductsOf = ({
	product,
}: {
	product: FullProduct;
}): Array<FullProduct | null | undefined> => [
	product.base_product,
	...(product.variants ?? []),
	...(product.licenses ?? []).flatMap((license) => [
		license.product as FullProduct,
		license.base_product as FullProduct | undefined,
	]),
	...(product.parent_plan_licenses ?? []).map(
		(parentLicense) => parentLicense.product as FullProduct,
	),
];

/**
 * Live catalog keyed by internal_id. Top-level rows win so nextFullProduct
 * (mutated as Stripe ids land) beats nested listFull snapshots.
 */
export const catalogProductsByInternalId = ({
	products,
}: {
	products: FullProduct[];
}): Map<string, FullProduct> => {
	const byInternalId = new Map<string, FullProduct>();
	const queue: FullProduct[] = [];

	for (const product of products) {
		byInternalId.set(product.internal_id, product);
		queue.push(product);
	}

	for (const product of queue) {
		for (const nested of nestedProductsOf({ product })) {
			if (!nested || byInternalId.has(nested.internal_id)) continue;
			byInternalId.set(nested.internal_id, nested);
			queue.push(nested);
		}
	}

	return byInternalId;
};

const familyBaseInternalId = ({ product }: { product: FullProduct }) =>
	product.base_internal_product_id ?? product.internal_id;

const isInStripeFamily = ({
	product,
	familyBaseId,
}: {
	product: FullProduct;
	familyBaseId: string;
}) =>
	product.internal_id === familyBaseId ||
	product.base_internal_product_id === familyBaseId;

/** Base row + its variants, excluding `product` itself. */
export const stripeCandidatesFromCatalog = ({
	product,
	catalogByInternalId,
}: {
	product: FullProduct;
	catalogByInternalId: Map<string, FullProduct>;
}): FullProduct[] => {
	const familyBaseId = familyBaseInternalId({ product });
	return [...catalogByInternalId.values()].filter(
		(candidate) =>
			candidate.internal_id !== product.internal_id &&
			isInStripeFamily({ product: candidate, familyBaseId }),
	);
};
