import type { FullCusProduct } from "@autumn/shared";
import { generateId } from "@/utils/genUtils";

export const duplicateCustomerProduct = ({
	customerProduct,
	newInternalProductId,
}: {
	customerProduct: FullCusProduct;
	newInternalProductId: string;
}): FullCusProduct => {
	const customerProductId = generateId("cus_prod");
	const now = Date.now();

	const customerEntitlements = customerProduct.customer_entitlements.map(
		(customerEntitlement) => {
			const customerEntitlementId = generateId("cus_ent");

			return {
				...customerEntitlement,
				id: customerEntitlementId,
				customer_product_id: customerProductId,
				created_at: now,
				replaceables: customerEntitlement.replaceables.map((replaceable) => ({
					...replaceable,
					id: generateId("rep"),
					cus_ent_id: customerEntitlementId,
					created_at: now,
				})),
				rollovers: customerEntitlement.rollovers.map((rollover) => ({
					...rollover,
					id: generateId("roll"),
					cus_ent_id: customerEntitlementId,
				})),
			};
		},
	);

	const customerPrices = customerProduct.customer_prices.map(
		(customerPrice) => ({
			...customerPrice,
			id: generateId("cus_price"),
			customer_product_id: customerProductId,
			created_at: now,
		}),
	);

	return {
		...customerProduct,
		id: customerProductId,
		internal_product_id: newInternalProductId,
		product: {
			...customerProduct.product,
			internal_id: newInternalProductId,
		},
		created_at: now,
		updated_at: now,
		customer_entitlements: customerEntitlements,
		customer_prices: customerPrices,
	};
};
