import type { PreviewSyncV2Response, SyncParamsV1 } from "@autumn/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useDebounce } from "@/hooks/useDebounce";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const PREVIEW_DEBOUNCE_MS = 400;

/** What verify would report once `params` synced, re-asked as the draft settles. */
export const usePreviewSyncV2 = ({
	params,
}: {
	params: SyncParamsV1 | null;
}) => {
	const axiosInstance = useAxiosInstance();
	const queryKeyFactory = useQueryKeyFactory();
	const debouncedParams = useDebounce({
		value: params,
		delayMs: PREVIEW_DEBOUNCE_MS,
	});

	const query = useQuery({
		queryKey: queryKeyFactory(["preview-sync-v2", debouncedParams]),
		queryFn: async (): Promise<PreviewSyncV2Response> => {
			const { data } = await axiosInstance.post(
				"/v1/billing.preview_sync_v2",
				debouncedParams,
			);
			return data;
		},
		// Verify only checks live subscriptions.
		enabled: Boolean(debouncedParams?.stripe_subscription_id),
		placeholderData: keepPreviousData,
	});

	return { mismatches: query.data?.mismatches };
};
