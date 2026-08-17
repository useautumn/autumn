import type { AttachPreviewResponse } from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { useMemo } from "react";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useDebounce } from "@/hooks/useDebounce";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const BILLING_PREVIEW_EXPAND = [
	"incoming.plan.items.feature",
	"outgoing.plan.items.feature",
] as const;

export function useBillingPreview<
	TRequestBody extends object,
	TResponse = AttachPreviewResponse,
>({
	path,
	queryKeyPrefix,
	requestBody,
	enabled,
}: {
	path: string;
	queryKeyPrefix: string;
	requestBody: TRequestBody | null;
	enabled?: boolean;
}) {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const request = useMemo(
		() => ({
			body: requestBody,
			key: JSON.stringify(requestBody),
			path,
		}),
		[path, requestBody],
	);
	const debouncedRequest = useDebounce({ value: request, delayMs: 300 });

	const shouldEnable = enabled ?? !!requestBody;
	const isDebouncing =
		request.key !== debouncedRequest.key ||
		request.path !== debouncedRequest.path;
	const query = useQuery({
		queryKey: buildKey([
			queryKeyPrefix,
			debouncedRequest.path,
			debouncedRequest.key,
		]),
		queryFn: async () => {
			if (!debouncedRequest.body) return null;

			const response = await axiosInstance.post<TResponse>(
				debouncedRequest.path,
				{
					...debouncedRequest.body,
					expand: BILLING_PREVIEW_EXPAND,
				},
			);
			return response.data;
		},
		enabled: shouldEnable && debouncedRequest.body !== null && !isDebouncing,
		staleTime: 0,
		refetchOnWindowFocus: false,
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
