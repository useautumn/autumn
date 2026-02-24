import { AppEnv, type ProductV2 } from "@autumn/shared";
import { useMemo } from "react";
import { useOrg } from "@/hooks/common/useOrg";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useHasChanges, useProductStore } from "@/hooks/stores/useProductStore";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import { convertPrepaidOptionsToFeatureOptions } from "@/utils/billing/prepaidQuantityUtils";
import { useEnv } from "@/utils/envUtils";
import { getRedirectUrl } from "@/utils/genUtils";
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
	successUrl?: string;
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
	const env = useEnv();
	const { org, isLoading: isOrgLoading, error: orgError } = useOrg();

	// Memoized builder function that can be called with runtime params
	const buildAttachBody = useMemo(
		() => (runtimeParams?: AttachBodyBuilderParams) => {
			const mergedParams = { ...params, ...runtimeParams };

			const redirectUrl = getRedirectUrl(
				`/customers/${mergedParams.customerId}`,
				env,
			);

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
				? convertPrepaidOptionsToFeatureOptions({
						prepaidOptions: mergedParams.prepaidOptions,
						product,
					})
				: undefined;

			// Build the attach body
			return getAttachBody({
				customerId: mergedParams.customerId,
				product,
				entityId: mergedParams.entityId ?? storeEntityId ?? undefined,
				optionsInput: options,
				isCustom,
				version,
				useInvoice: mergedParams.useInvoice,
				enableProductImmediately: mergedParams.enableProductImmediately,
				successUrl:
					// env === AppEnv.Sandbox
					// 	? `${import.meta.env.VITE_FRONTEND_URL}${redirectUrl}`
					// 	: undefined,
					org?.success_url && !isOrgLoading && !orgError
						? org.success_url
						: env === AppEnv.Sandbox
							? `${import.meta.env.VITE_FRONTEND_URL}${redirectUrl}`
							: undefined,
			});
		},
		[
			products,
			hasChanges,
			storeProduct,
			storeEntityId,
			params,
			org,
			isOrgLoading,
			orgError,
		],
	);

	// For simple usage, return the built body with current params
	const attachBody = useMemo(() => buildAttachBody(), [buildAttachBody]);

	return { attachBody, buildAttachBody };
}
