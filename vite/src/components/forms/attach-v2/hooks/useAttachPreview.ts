import type {
	AttachParamsV0,
	AttachPreviewResponse,
	CreateScheduleParamsV0,
} from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { useEffect, useMemo, useState } from "react";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getAttachBillingPath } from "../utils/attachBillingPath";

const ATTACH_PREVIEW_EXPAND = [
	"incoming.plan.items.feature",
	"outgoing.plan.items.feature",
] as const;

interface UseAttachPreviewParams {
	requestBody: AttachParamsV0 | CreateScheduleParamsV0 | null;
	isMultiPlan?: boolean;
	enabled?: boolean;
}

export function useAttachPreview({
	requestBody,
	isMultiPlan = false,
	enabled,
}: UseAttachPreviewParams) {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const shouldEnable = enabled !== undefined ? enabled : !!requestBody;
	const previewPath = getAttachBillingPath({ isMultiPlan, preview: true });

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
		queryKey: buildKey(["attach-preview-v2", previewPath, debouncedQueryKey]),
		queryFn: async () => {
			if (!requestBody) {
				return null;
			}

			const response = await axiosInstance.post<AttachPreviewResponse>(
				previewPath,
				{
					...requestBody,
					expand: ATTACH_PREVIEW_EXPAND,
				},
			);

			return response.data;
		},
		enabled: shouldEnable,
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

export type UseAttachPreviewReturn = ReturnType<typeof useAttachPreview>;
