import type {
	CreateCustomerExportParams,
	CustomerExportResponse,
	DownloadCustomerExportResponse,
} from "@autumn/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

export const CUSTOMER_EXPORTS_QUERY_KEY = "customer-exports";

const UNFILTERED_CUSTOMER_COUNT_QUERY_KEY = "customers-count-unfiltered";
const CUSTOMER_EXPORTS_PAGE_SIZE = 20;
const ACTIVE_EXPORT_POLL_INTERVAL_MS = 5000;
/** Realtime carries progress; this only catches a dropped subscription. */
const REALTIME_SAFETY_NET_POLL_INTERVAL_MS = 60_000;

/** Total customers ignoring the customers page search and filters. */
export const useUnfilteredCustomerCountQuery = ({
	enabled,
}: {
	enabled: boolean;
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	return useQuery({
		queryKey: buildKey([UNFILTERED_CUSTOMER_COUNT_QUERY_KEY]),
		enabled,
		queryFn: async () => {
			const { data } = await axiosInstance.post("/customers/all/count", {
				search: "",
				filters: {},
			});
			return data.totalCount as number;
		},
	});
};

export const isCustomerExportActive = (
	customerExport: CustomerExportResponse,
) => customerExport.status === "queued" || customerExport.status === "running";

const isSubscribableToRealtime = (customerExport: CustomerExportResponse) =>
	Boolean(customerExport.trigger_run_id && customerExport.public_access_token);

const resolveExportsPollInterval = ({
	customerExports,
}: {
	customerExports: CustomerExportResponse[];
}) => {
	const activeExports = customerExports.filter(isCustomerExportActive);
	if (activeExports.length === 0) return false;
	return activeExports.every(isSubscribableToRealtime)
		? REALTIME_SAFETY_NET_POLL_INTERVAL_MS
		: ACTIVE_EXPORT_POLL_INTERVAL_MS;
};

/** Polls only while the sheet is open AND something is still queued or running. */
export const useCustomerExportsQuery = ({ enabled }: { enabled: boolean }) => {
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
			if (!enabled || !customerExports) return false;
			return resolveExportsPollInterval({ customerExports });
		},
	});
};

/** The DB, not the trigger run, decides when an export is downloadable. */
export const useInvalidateCustomerExports = () => {
	const queryClient = useQueryClient();
	const buildKey = useQueryKeyFactory();

	return () => {
		queryClient.invalidateQueries({
			queryKey: buildKey([CUSTOMER_EXPORTS_QUERY_KEY]),
		});
	};
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
