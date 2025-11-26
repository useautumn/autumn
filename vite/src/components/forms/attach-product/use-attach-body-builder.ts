import type { ProductV2 } from "@autumn/shared";
import { useMemo } from "react";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useHasChanges } from "@/hooks/stores/useProductStore";
import {
	useAttachProductStore,
	useEntity,
} from "@/hooks/stores/useSubscriptionStore";
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
 * Shared hook to build attach body from various sources (params, store, products list)
 * Used by both useAttachPreview and useAttachProductMutation to keep logic DRY
 */
export function useAttachBodyBuilder(params: AttachBodyBuilderParams = {}) {
	const { products } = useProductsQuery();
	const customizedProduct = useAttachProductStore((s) => s.customizedProduct);
	const hasChanges = useHasChanges();
	const { entityId: storeEntityId } = useEntity();
	const storeProductId = useAttachProductStore((s) => s.productId);

	// Memoized builder function that can be called with runtime params
	const buildAttachBody = useMemo(
		() => (runtimeParams?: AttachBodyBuilderParams) => {
			const mergedParams = { ...params, ...runtimeParams };

			// Resolve the product: use provided product, or customized product from store, or find by ID
			const product =
				mergedParams.product ||
				customizedProduct ||
				products.find((p) => p.id === mergedParams.productId);

			if (!product || !mergedParams.customerId) {
				return null;
			}

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
				isCustom: !!customizedProduct,
				version: mergedParams.version ?? product.version,
				useInvoice: mergedParams.useInvoice,
				enableProductImmediately: mergedParams.enableProductImmediately,
			});
		},
		[customizedProduct, products, hasChanges, storeEntityId, params],
	);

	// For simple usage, return the built body with current params
	const attachBody = useMemo(() => buildAttachBody(), [buildAttachBody]);

	return { attachBody, buildAttachBody };
}
