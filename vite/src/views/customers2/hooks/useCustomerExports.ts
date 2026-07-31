import type {
	CreateCustomerExportParams,
	CustomerExportResponse,
	DownloadCustomerExportResponse,
} from "@autumn/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export const CUSTOMER_EXPORTS_QUERY_KEY = "customer-exports";

const CUSTOMER_EXPORTS_PAGE_SIZE = 20;
const ACTIVE_EXPORT_POLL_INTERVAL_MS = 5000;

export const isCustomerExportActive = (
	customerExport: CustomerExportResponse,
) => customerExport.status === "queued" || customerExport.status === "running";

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
			return customerExports.some(isCustomerExportActive)
				? ACTIVE_EXPORT_POLL_INTERVAL_MS
				: false;
		},
	});
};

export const useCreateCustomerExport = () => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const buildKey = useQueryKeyFactory();

	return useMutation({
		mutationFn: async (params: CreateCustomerExportParams) => {
			const { data } = await axiosInstance.post("/customers/exports", params);
			return data.export as CustomerExportResponse;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: buildKey([CUSTOMER_EXPORTS_QUERY_KEY]),
			});
		},
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
	});
};
