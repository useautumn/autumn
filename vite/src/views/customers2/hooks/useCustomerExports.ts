import type {
	CreateCustomerExportParams,
	CustomerExportResponse,
	DownloadCustomerExportResponse,
} from "@autumn/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

export const CUSTOMER_EXPORTS_QUERY_KEY = "customer-exports";

const CUSTOMER_EXPORTS_PAGE_SIZE = 20;
const ACTIVE_EXPORT_POLL_INTERVAL_MS = 5000;
/** Realtime carries progress; this only catches a dropped subscription. */
const REALTIME_SAFETY_NET_POLL_INTERVAL_MS = 60_000;

export const isCustomerExportActive = (
	customerExport: CustomerExportResponse,
) => customerExport.status === "queued" || customerExport.status === "running";

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

/** Polls only while the sheet is open AND something is still queued or running. */
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
			const { data } = await axiosInstance.get("/customers/exports", {
				params: { limit: CUSTOMER_EXPORTS_PAGE_SIZE },
			});
			return data.exports as CustomerExportResponse[];
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

/** The DB, not the trigger run, decides when an export is downloadable. */
export const useInvalidateCustomerExports = () => {
	const queryClient = useQueryClient();
	const buildKey = useQueryKeyFactory();
	// The key factory rebuilds its array every render, so read it through a ref to
	// keep the returned callback stable for effect dependencies.
	const queryKeyRef = useRef(buildKey([CUSTOMER_EXPORTS_QUERY_KEY]));
	queryKeyRef.current = buildKey([CUSTOMER_EXPORTS_QUERY_KEY]);

	return useCallback(() => {
		queryClient.invalidateQueries({ queryKey: queryKeyRef.current });
	}, [queryClient]);
};

export const useCreateCustomerExport = () => {
	const axiosInstance = useAxiosInstance();
	const invalidateExports = useInvalidateCustomerExports();

	return useMutation({
		mutationFn: async (params: CreateCustomerExportParams) => {
			const { data } = await axiosInstance.post("/customers/exports", params);
			return data.export as CustomerExportResponse;
		},
		onSuccess: invalidateExports,
	});
};

export const useDownloadCustomerExport = () => {
	const axiosInstance = useAxiosInstance();

	return useMutation({
		mutationFn: async ({ exportId }: { exportId: string }) => {
			const { data } = await axiosInstance.post(
				`/customers/exports/${exportId}/download`,
			);
			return data as DownloadCustomerExportResponse;
		},
		onSuccess: (data) => {
			window.location.assign(data.url);
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to download export"));
		},
	});
};
