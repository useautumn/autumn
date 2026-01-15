import type {
	CreateFreeTrial,
	PreviewUpdateSubscriptionResponse,
	ProductItem,
} from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { useEffect, useMemo, useState } from "react";
import type { UpdateSubscriptionFormContext } from "@/components/forms/update-subscription-v2/context/UpdateSubscriptionFormContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useUpdateSubscriptionBodyBuilder } from "./use-update-subscription-body-builder";

export function useUpdateSubscriptionPreview({
	updateSubscriptionFormContext,
	prepaidOptions,
	freeTrial,
	enabled,
	items,
	version,
}: {
	updateSubscriptionFormContext: UpdateSubscriptionFormContext;
	prepaidOptions?: Record<string, number>;
	freeTrial?: CreateFreeTrial | null;
	enabled?: boolean;
	items?: ProductItem[] | null;
	version?: number;
}) {
	const { customerId, product, entityId } = updateSubscriptionFormContext;
	const axiosInstance = useAxiosInstance();

	const { updateSubscriptionBody } = useUpdateSubscriptionBodyBuilder({
		customerId,
		product,
		entityId,
		prepaidOptions,
		version: version ?? product?.version,
		freeTrial,
		items,
	});

	const shouldEnable =
		enabled !== undefined
			? enabled
			: !!(customerId && product && updateSubscriptionBody);

	const queryKeyDeps = useMemo(
		() => JSON.stringify(updateSubscriptionBody),
		[updateSubscriptionBody],
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
		queryKey: ["update-subscription-preview", debouncedQueryKey],
		queryFn: async () => {
			if (!updateSubscriptionBody || !customerId) {
				return null;
			}

			const response =
				await axiosInstance.post<PreviewUpdateSubscriptionResponse>(
					"/v1/subscriptions/preview_update",
					updateSubscriptionBody,
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
		isLoading: query.isLoading || isDebouncing,
	};
}
