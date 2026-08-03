import {
	ACTIVE_CUSTOMER_EXPORT_STATUSES,
	type CreateCustomerExportParams,
	type CustomerExportResponse,
	type DownloadCustomerExportResponse,
	type ListCustomerExportsResponse,
	MAX_CUSTOMER_EXPORTS_PAGE_SIZE,
	ms,
} from "@autumn/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

export const CUSTOMER_EXPORTS_QUERY_KEY = "customer-exports";

const ACTIVE_EXPORT_POLL_INTERVAL_MS = ms.seconds(5);
/** Realtime carries progress; this poll only catches a dropped subscription. */
const REALTIME_SAFETY_NET_POLL_INTERVAL_MS = ms.minutes(1);

export const isCustomerExportActive = (
	customerExport: CustomerExportResponse,
) =>
	ACTIVE_CUSTOMER_EXPORT_STATUSES.some(
		(status) => status === customerExport.status,
	);

const isSubscribableToRealtime = (customerExport: CustomerExportResponse) =>
	Boolean(customerExport.trigger_run_id && customerExport.public_access_token);

const resolveExportsPollInterval = ({
	customerExports,
	isRealtimeDegraded,
}: {
	customerExports: CustomerExportResponse[];
	isRealtimeDegraded: boolean;
}) => {
	const activeExports = customerExports.filter(isCustomerExportActive);
	if (activeExports.length === 0) return false;

	const canRelyOnRealtime =
		!isRealtimeDegraded && activeExports.every(isSubscribableToRealtime);
	return canRelyOnRealtime
		? REALTIME_SAFETY_NET_POLL_INTERVAL_MS
		: ACTIVE_EXPORT_POLL_INTERVAL_MS;
};

export const useCustomerExportsQuery = ({
	enabled,
	isRealtimeDegraded = false,
}: {
	enabled: boolean;
	isRealtimeDegraded?: boolean;
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	return useQuery({
		queryKey: buildKey([CUSTOMER_EXPORTS_QUERY_KEY]),
		enabled,
		queryFn: async () => {
			const { data } = await axiosInstance.get<ListCustomerExportsResponse>(
				"/customers/exports",
				{ params: { limit: MAX_CUSTOMER_EXPORTS_PAGE_SIZE } },
			);
			return data.exports;
		},
		refetchInterval: (query) => {
			const customerExports = query.state.data;
			if (!customerExports) return false;
			return resolveExportsPollInterval({
				customerExports,
				isRealtimeDegraded,
			});
		},
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
