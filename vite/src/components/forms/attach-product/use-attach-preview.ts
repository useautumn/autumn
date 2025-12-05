import type { CheckoutResponseV0, ProductV2 } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useAttachBodyBuilder } from "./use-attach-body-builder";

interface AttachPreviewParams {
	// Required params - no fallbacks
	customerId?: string;
	product?: ProductV2;
	entityId?: string;
	prepaidOptions?: Record<string, number>;
	version?: number;

	// Control behavior
	enabled?: boolean;
}

export function useAttachPreview(params: AttachPreviewParams = {}) {
	const axiosInstance = useAxiosInstance();

	// Build attach body using shared hook with explicit params
	const { attachBody } = useAttachBodyBuilder({
		customerId: params.customerId,
		product: params.product,
		entityId: params.entityId,
		prepaidOptions: params.prepaidOptions,
		version: params.version,
	});

	// Auto-enable if not explicitly set and all required data is present
	const shouldEnable =
		params.enabled !== undefined
			? params.enabled
			: !!(params.customerId && params.product && attachBody);

	// Create a stable serialized key from attachBody (which already captures all dependencies)
	const queryKeyDeps = useMemo(() => JSON.stringify(attachBody), [attachBody]);

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
		queryKey: ["attach-checkout", debouncedQueryKey],
		queryFn: async () => {
			if (!attachBody || !params.customerId) {
				return null;
			}

			const response = await axiosInstance.post<CheckoutResponseV0>(
				"/v1/checkout",
				attachBody,
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
