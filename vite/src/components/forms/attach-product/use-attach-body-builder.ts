import type { ProductV2 } from "@autumn/shared";
import { useMemo } from "react";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useHasChanges, useProductStore } from "@/hooks/stores/useProductStore";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import { getAttachBody } from "@/views/customers/customer/product/components/attachProductUtils";

interface AttachBodyBuilderParams {
	customerId?: string;
	productId?: string;
	product?: ProductV2;
	entityId?: string;
	prepaidOptions?: Record<string, number>;
	version?: number;
	useInvoice?: boolean;
	enableProductImmediately?: boolean;
}

/**
 * Shared hook to build attach body from explicit params
 * Used by both useAttachPreview and useAttachProductMutation to keep logic DRY
 */
export function useAttachBodyBuilder(params: AttachBodyBuilderParams = {}) {
	const { products } = useProductsQuery();
	const hasChanges = useHasChanges();
	const storeProduct = useProductStore((s) => s.product);
	const { entityId: storeEntityId } = useEntity();

	// Memoized builder function that can be called with runtime params
	const buildAttachBody = useMemo(
		() => (runtimeParams?: AttachBodyBuilderParams) => {
			const mergedParams = { ...params, ...runtimeParams };

			// Resolve the product: use provided product or find by ID
			const product =
				mergedParams.product ||
				products.find((p) => p.id === mergedParams.productId);

			if (!product || !mergedParams.customerId) {
				return null;
			}

			// Determine if this is a custom product (from store with changes)
			const isCustom =
				hasChanges && !!storeProduct?.id && product === storeProduct
					? true
					: undefined;
			const version = storeProduct?.id ? storeProduct.version : undefined;

			// Convert prepaidOptions to options array
			const options = mergedParams.prepaidOptions
				? Object.entries(mergedParams.prepaidOptions).map(
						([featureId, quantity]) => ({
							feature_id: featureId,
							quantity: quantity,
						}),
					)
				: [];

			// Build the attach body
			return getAttachBody({
				customerId: mergedParams.customerId,
				product,
				entityId: mergedParams.entityId ?? storeEntityId ?? undefined,
				optionsInput: options.length > 0 ? options : undefined,
				isCustom,
				version,
				useInvoice: mergedParams.useInvoice,
				enableProductImmediately: mergedParams.enableProductImmediately,
			});
		},
		[products, hasChanges, storeProduct, storeEntityId, params],
	);

	// For simple usage, return the built body with current params
	const attachBody = useMemo(() => buildAttachBody(), [buildAttachBody]);

	return { attachBody, buildAttachBody };
}
