import type {
	CreateFreeTrial,
	PreviewUpdateSubscriptionResponse,
} from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { UpdateSubscriptionFormContext } from "@/components/forms/update-subscription-v2/context/UpdateSubscriptionFormContext";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useUpdateSubscriptionBodyBuilder } from "./use-update-subscription-body-builder";

export function useUpdateSubscriptionPreview({
	updateSubscriptionFormContext,
	prepaidOptions,
	freeTrial,
	enabled,
}: {
	updateSubscriptionFormContext: UpdateSubscriptionFormContext;
	prepaidOptions?: Record<string, number>;
	freeTrial?: CreateFreeTrial | null;
	enabled?: boolean;
}) {
	const { customerId, product, entityId } = updateSubscriptionFormContext;
	const axiosInstance = useAxiosInstance();

	const { updateSubscriptionBody } = useUpdateSubscriptionBodyBuilder({
		customerId,
		product,
		entityId,
		prepaidOptions,
		version: product?.version,
		freeTrial,
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
	});

	return {
		...query,
		isLoading: query.isLoading || isDebouncing,
	};
}
