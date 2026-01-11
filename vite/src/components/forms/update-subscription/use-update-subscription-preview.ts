import type {
	CheckoutResponseV0,
	CreateFreeTrial,
	ProductV2,
} from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useUpdateSubscriptionBodyBuilder } from "./use-update-subscription-body-builder";

interface UpdateSubscriptionPreviewParams {
	// Required params - no fallbacks
	customerId?: string;
	product?: ProductV2;
	entityId?: string;
	prepaidOptions?: Record<string, number>;
	version?: number;

	// Free trial param - null removes trial, undefined preserves existing
	freeTrial?: CreateFreeTrial | null;

	// Control behavior
	enabled?: boolean;
}

export function useUpdateSubscriptionPreview(
	params: UpdateSubscriptionPreviewParams = {},
) {
	const axiosInstance = useAxiosInstance();

	// Build update subscription body using shared hook with explicit params
	const { updateSubscriptionBody } = useUpdateSubscriptionBodyBuilder({
		customerId: params.customerId,
		product: params.product,
		entityId: params.entityId,
		prepaidOptions: params.prepaidOptions,
		version: params.version,
		freeTrial: params.freeTrial,
	});

	// Auto-enable if not explicitly set and all required data is present
	const shouldEnable =
		params.enabled !== undefined
			? params.enabled
			: !!(params.customerId && params.product && updateSubscriptionBody);

	// Create a stable serialized key from updateSubscriptionBody (which already captures all dependencies)
	const queryKeyDeps = useMemo(
		() => JSON.stringify(updateSubscriptionBody),
		[updateSubscriptionBody],
	);

	// Debounce the query key to delay API calls by 150ms
	const [debouncedQueryKey, setDebouncedQueryKey] = useState(queryKeyDeps);

	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedQueryKey(queryKeyDeps);
		}, 300);
		return () => clearTimeout(timer);
	}, [queryKeyDeps]);

	// Track if we're in a debouncing state (query key has changed but debounce hasn't completed)
	const isDebouncing = queryKeyDeps !== debouncedQueryKey;

	const query = useQuery({
		queryKey: ["update-subscription-preview", debouncedQueryKey],
		queryFn: async () => {
			if (!updateSubscriptionBody || !params.customerId) {
				return null;
			}

			const response = await axiosInstance.post<CheckoutResponseV0>(
				"/v1/subscriptions/preview_update",
				updateSubscriptionBody,
			);

			return response.data;
		},
		enabled: shouldEnable,
		staleTime: 0, // Always fetch fresh pricing
	});

	// Override isLoading to include debouncing state
	// This prevents showing stale data during the transition between diff plans in the selector
	return {
		...query,
		isLoading: query.isLoading || isDebouncing,
	};
}
