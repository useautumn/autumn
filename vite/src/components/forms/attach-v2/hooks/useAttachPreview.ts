import type {
	BillingPreviewResponse,
	ProductItem,
	ProductV2,
} from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { useEffect, useMemo, useState } from "react";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useAttachRequestBody } from "./useAttachRequestBody";

interface UseAttachPreviewParams {
	customerId: string | undefined;
	entityId: string | undefined;
	product: ProductV2 | undefined;
	prepaidOptions: Record<string, number>;
	items: ProductItem[] | null;
	version: number | undefined;
	enabled?: boolean;
}

export function useAttachPreview({
	customerId,
	entityId,
	product,
	prepaidOptions,
	items,
	version,
	enabled,
}: UseAttachPreviewParams) {
	const axiosInstance = useAxiosInstance();

	const { requestBody } = useAttachRequestBody({
		customerId,
		entityId,
		product,
		prepaidOptions,
		items,
		version,
	});

	const shouldEnable =
		enabled !== undefined ? enabled : !!(customerId && product && requestBody);

	const queryKeyDeps = useMemo(
		() => JSON.stringify(requestBody),
		[requestBody],
	);

	const [debouncedQueryKey, setDebouncedQueryKey] = useState(queryKeyDeps);

	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedQueryKey(queryKeyDeps);
		}, 300);
		return () => clearTimeout(timer);
	}, [queryKeyDeps]);

	const isDebouncing = queryKeyDeps !== debouncedQueryKey;

	const query = useQuery({
		queryKey: ["attach-preview-v2", debouncedQueryKey],
		queryFn: async () => {
			if (!requestBody || !customerId) {
				return null;
			}

			const response = await axiosInstance.post<BillingPreviewResponse>(
				"/v1/billing/preview_attach",
				requestBody,
			);

			return response.data;
		},
		enabled: shouldEnable,
		staleTime: 0,
		retry: (failureCount, error) => {
			const status = (error as AxiosError)?.response?.status;
			if (status && status >= 400 && status < 500) return false;
			return failureCount < 3;
		},
	});

	return {
		...query,
		isLoading: shouldEnable && (query.isLoading || isDebouncing),
	};
}

export type UseAttachPreviewReturn = ReturnType<typeof useAttachPreview>;
