import { AppEnv, type ProductV2, UsageModel } from "@autumn/shared";
import Decimal from "decimal.js";
import { useMemo } from "react";
import { useOrg } from "@/hooks/common/useOrg";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useHasChanges, useProductStore } from "@/hooks/stores/useProductStore";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
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
				? Object.entries(mergedParams.prepaidOptions).map(
						([featureId, quantity]) => {
							const prepaidItem = product?.items.find(
								(item) =>
									item.feature_id === featureId &&
									item.usage_model === UsageModel.Prepaid,
							);

							if (!prepaidItem) {
								return {
									feature_id: featureId,
									quantity: quantity,
								};
							}

							return {
								feature_id: featureId,
								quantity: new Decimal(quantity || 0)
									.mul(prepaidItem.billing_units || 1)
									.toNumber(),
							};
						},
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
