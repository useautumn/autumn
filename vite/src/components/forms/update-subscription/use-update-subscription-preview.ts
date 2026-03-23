import type {
	PreviewUpdateSubscriptionResponse,
	UpdateSubscriptionV0Params,
} from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { useEffect, useState } from "react";

import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const UPDATE_PREVIEW_EXPAND = [
	"incoming.plan.items.feature",
	"outgoing.plan.items.feature",
] as const;

/** Debounced preview query for update subscription. Accepts a pre-built request body. */
export function useUpdateSubscriptionPreview({
	body,
	enabled,
}: {
	body: UpdateSubscriptionV0Params | null;
	enabled?: boolean;
}) {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const shouldEnable = enabled !== undefined ? enabled : !!body;

	const queryKeyDeps = JSON.stringify(body);

	const [debouncedQueryKey, setDebouncedQueryKey] = useState(queryKeyDeps);
	const [isDebouncing, setIsDebouncing] = useState(false);

	useEffect(() => {
		if (queryKeyDeps === debouncedQueryKey) {
			setIsDebouncing(false);
			return;
		}

		setIsDebouncing(true);
		const timer = setTimeout(() => {
			setDebouncedQueryKey(queryKeyDeps);
			setIsDebouncing(false);
		}, 300);
		return () => clearTimeout(timer);
	}, [queryKeyDeps, debouncedQueryKey]);

	const query = useQuery({
		queryKey: buildKey(["update-subscription-preview", debouncedQueryKey]),
		queryFn: async () => {
			if (!body) return null;

			const response =
				await axiosInstance.post<PreviewUpdateSubscriptionResponse>(
					"/v1/billing.preview_update",
					{
						...body,
						expand: UPDATE_PREVIEW_EXPAND,
					},
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

export type UseUpdateSubscriptionPreviewReturn = ReturnType<
	typeof useUpdateSubscriptionPreview
>;
