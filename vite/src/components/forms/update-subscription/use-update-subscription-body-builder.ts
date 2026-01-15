import {
	AppEnv,
	type CreateFreeTrial,
	type ProductItem,
	type ProductV2,
	UsageModel,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { useMemo } from "react";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useHasChanges, useProductStore } from "@/hooks/stores/useProductStore";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import { useEnv } from "@/utils/envUtils";
import { getRedirectUrl } from "@/utils/genUtils";
import { getUpdateSubscriptionBody } from "./get-update-subscription-body";

interface UpdateSubscriptionBodyBuilderParams {
	customerId?: string;
	productId?: string;
	product?: ProductV2;
	entityId?: string;
	prepaidOptions?: Record<string, number>;
	version?: number;
	useInvoice?: boolean;
	enableProductImmediately?: boolean;

	// Free trial param - null removes trial, undefined preserves existing
	freeTrial?: CreateFreeTrial | null;
	// Custom items for preview support (separate from isCustom logic)
	items?: ProductItem[] | null;
}

/**
 * Shared hook to build update subscription body from explicit params.
 * Similar to useAttachBodyBuilder but includes free_trial support.
 */
export function useUpdateSubscriptionBodyBuilder(
	params: UpdateSubscriptionBodyBuilderParams = {},
) {
	const { products } = useProductsQuery();
	const hasChanges = useHasChanges();
	const storeProduct = useProductStore((s) => s.product);
	const { entityId: storeEntityId } = useEntity();
	const env = useEnv();

	// Memoized builder function that can be called with runtime params
	const buildUpdateSubscriptionBody = useMemo(
		() => (runtimeParams?: UpdateSubscriptionBodyBuilderParams) => {
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

			// Build the body using getUpdateSubscriptionBody (includes freeTrial support)
			return getUpdateSubscriptionBody({
				customerId: mergedParams.customerId,
				product,
				entityId: mergedParams.entityId ?? storeEntityId ?? undefined,
				optionsInput: options.length > 0 ? options : undefined,
				isCustom,
				version,
				useInvoice: mergedParams.useInvoice,
				enableProductImmediately: mergedParams.enableProductImmediately,
				successUrl:
					env === AppEnv.Sandbox
						? `${import.meta.env.VITE_FRONTEND_URL}${redirectUrl}`
						: undefined,
				freeTrial: mergedParams.freeTrial,
				items: mergedParams.items,
			});
		},
		[products, hasChanges, storeProduct, storeEntityId, params, env],
	);

	// For simple usage, return the built body with current params
	const updateSubscriptionBody = useMemo(
		() => buildUpdateSubscriptionBody(),
		[buildUpdateSubscriptionBody],
	);

	return { updateSubscriptionBody, buildUpdateSubscriptionBody };
}
