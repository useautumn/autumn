import type {
	BillingPreviewResponse,
	CreateScheduleParamsV0Input,
} from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { useEffect, useMemo, useState } from "react";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const SCHEDULE_PREVIEW_EXPAND = [
	"incoming.plan.items.feature",
	"outgoing.plan.items.feature",
] as const;

export function useCreateSchedulePreview({
	requestBody,
}: {
	requestBody: CreateScheduleParamsV0Input | null;
}) {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

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
	const shouldEnable = !!requestBody;

	const query = useQuery({
		queryKey: buildKey(["create-schedule-preview", debouncedQueryKey]),
		queryFn: async () => {
			if (!requestBody) return null;

			const response = await axiosInstance.post<BillingPreviewResponse>(
				"/v1/billing.preview_create_schedule",
				{
					...requestBody,
					expand: SCHEDULE_PREVIEW_EXPAND,
				},
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
