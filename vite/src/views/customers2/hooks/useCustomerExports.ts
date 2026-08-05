import {
	type CreateCustomerExportParams,
	type CustomerExportResponse,
	type DownloadCustomerExportResponse,
	isCustomerExportActive,
	type ListCustomerExportsResponse,
	MAX_CUSTOMER_EXPORTS_PAGE_SIZE,
	ms,
} from "@autumn/shared";
import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

export const CUSTOMER_EXPORTS_QUERY_KEY = "customer-exports";

// Small exports finish in under a second — often before the realtime
// subscription connects — so an active export is always polled, never left to
// realtime alone. Realtime still drives smooth progress between polls.
const ACTIVE_EXPORT_POLL_INTERVAL_MS = ms.seconds(2);

export const useCustomerExportsQuery = ({
	enabled,
	limit = MAX_CUSTOMER_EXPORTS_PAGE_SIZE,
	offset = 0,
}: {
	enabled: boolean;
	limit?: number;
	offset?: number;
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	return useQuery({
		queryKey: [...buildKey([CUSTOMER_EXPORTS_QUERY_KEY]), limit, offset],
		enabled,
		placeholderData: keepPreviousData,
		queryFn: async () => {
			const { data } = await axiosInstance.get<ListCustomerExportsResponse>(
				"/customers/exports",
				{ params: { limit, offset } },
			);
			return data;
		},
		refetchInterval: (query) =>
			query.state.data?.exports.some(isCustomerExportActive)
				? ACTIVE_EXPORT_POLL_INTERVAL_MS
				: false,
	});
};

export const useInvalidateCustomerExports = () => {
	const queryClient = useQueryClient();
	const buildKey = useQueryKeyFactory();

	return useCallback(() => {
		queryClient.invalidateQueries({
			queryKey: buildKey([CUSTOMER_EXPORTS_QUERY_KEY]),
		});
	}, [buildKey, queryClient]);
};

export const useCreateCustomerExport = () => {
	const axiosInstance = useAxiosInstance();
	const invalidateExports = useInvalidateCustomerExports();

	return useMutation({
		mutationFn: async (params: CreateCustomerExportParams) => {
			const { data } = await axiosInstance.post<{
				export: CustomerExportResponse;
			}>("/customers/exports", params);
			return data.export;
		},
		onSuccess: invalidateExports,
	});
};

export const useDownloadCustomerExport = () => {
	const axiosInstance = useAxiosInstance();

	return useMutation({
		mutationFn: async ({ exportId }: { exportId: string }) => {
			const { data } = await axiosInstance.post<DownloadCustomerExportResponse>(
				`/customers/exports/${exportId}/download`,
			);
			return data;
		},
		onSuccess: (data) => {
			window.location.assign(data.url);
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to download export"));
		},
	});
};
