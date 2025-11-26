import type { CheckoutResponse, ProductV2 } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useAttachProductStore } from "@/hooks/stores/useSubscriptionStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useAttachBodyBuilder } from "./use-attach-body-builder";

interface AttachPreviewParams {
	// Override store values
	customerId?: string;
	productId?: string;
	product?: ProductV2;
	entityId?: string;
	prepaidOptions?: Record<string, number>;
	version?: number;

	// Control behavior
	enabled?: boolean;
}

export function useAttachPreview(params: AttachPreviewParams = {}) {
	const axiosInstance = useAxiosInstance();

	// Get form values from store (can be overridden by params)
	const storeCustomerId = useAttachProductStore((s) => s.customerId);
	const storeProductId = useAttachProductStore((s) => s.productId);
	const storePrepaidOptions = useAttachProductStore((s) => s.prepaidOptions);

	// Use params if provided, otherwise fall back to store
	const customerId = params.customerId ?? storeCustomerId;
	const productId = params.productId ?? storeProductId;
	const prepaidOptions = params.prepaidOptions ?? storePrepaidOptions;

	// Build attach body using shared hook
	const { attachBody } = useAttachBodyBuilder({
		customerId: customerId ?? undefined,
		productId: productId ?? undefined,
		product: params.product, //customizedProduct is accessed within the hook, but can be overridden here
		entityId: params.entityId,
		prepaidOptions: prepaidOptions ?? undefined,
		version: params.version,
	});

	console.log("attachBody", attachBody);

	// Auto-enable if not explicitly set and all required data is present
	const shouldEnable =
		params.enabled !== undefined
			? params.enabled
			: !!(customerId && (productId || params.product) && attachBody);

	// Create a stable serialized key from attachBody (which already captures all dependencies)
	const queryKeyDeps = useMemo(() => JSON.stringify(attachBody), [attachBody]);

	// Debounce the query key to delay API calls by 200ms
	const [debouncedQueryKey, setDebouncedQueryKey] = useState(queryKeyDeps);

	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedQueryKey(queryKeyDeps);
		}, 150);
		return () => clearTimeout(timer);
	}, [queryKeyDeps]);

	return useQuery({
		queryKey: ["attach-checkout", debouncedQueryKey],
		queryFn: async () => {
			if (!attachBody || !customerId) {
				return null;
			}

			const response = await axiosInstance.post<CheckoutResponse>(
				"/v1/checkout",
				attachBody,
			);

			return response.data;
		},
		enabled: shouldEnable,
		staleTime: 0, // Always fetch fresh pricing
	});
}
