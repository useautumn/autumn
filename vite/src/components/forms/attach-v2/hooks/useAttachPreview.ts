import type { AttachParamsV0, AttachPreviewResponse } from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { useEffect, useMemo, useState } from "react";
import { useAxiosInstance } from "@/services/useAxiosInstance";

interface UseAttachPreviewParams {
	requestBody: AttachParamsV0 | null;
	enabled?: boolean;
}

export function useAttachPreview({
	requestBody,
	enabled,
}: UseAttachPreviewParams) {
	const axiosInstance = useAxiosInstance();

	const shouldEnable = enabled !== undefined ? enabled : !!requestBody;

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
			if (!requestBody) {
				return null;
			}

			const response = await axiosInstance.post<AttachPreviewResponse>(
				"/v1/billing.preview_attach",
				requestBody,
			);

			return response.data;
		},
		enabled: shouldEnable,
		staleTime: 0,
		placeholderData: keepPreviousData,
		retry: (failureCount, error) => {
			const status = (error as AxiosError)?.response?.status;
			if (status && status >= 400 && status < 500) return false;
			return failureCount < 3;
		},
	});

	return {
		...query,
		isLoading:
			shouldEnable && (query.isLoading || query.isFetching || isDebouncing),
	};
}

export type UseAttachPreviewReturn = ReturnType<typeof useAttachPreview>;
