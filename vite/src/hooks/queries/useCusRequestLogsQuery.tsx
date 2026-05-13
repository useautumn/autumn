import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import {
	useWorkbenchStore,
	type WorkbenchMethod,
	type WorkbenchStatus,
} from "@/hooks/stores/useWorkbenchStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export interface RequestLogEntry {
	id: string;
	time: string;
	statusCode: number;
	durationMs: number | null;
	method: string | null;
	url: string | null;
	path: string | null;
	reqId: string | null;
	ip: string | null;
	userAgent: string | null;
	customerId: string | null;
	msg: string | null;
	raw: Record<string, unknown>;
}

interface ListResponse {
	logs: RequestLogEntry[];
	unconfigured?: boolean;
}

export const useCusRequestLogsQuery = ({
	customerId,
	enabled,
}: {
	customerId: string | undefined;
	enabled: boolean;
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const filters = useWorkbenchStore((s) => s.filters);

	const { data, isLoading, isFetching, error, refetch } =
		useQuery<ListResponse>({
			queryKey: buildKey([
				"customer_request_logs",
				customerId,
				filters.method,
				filters.status,
				filters.search,
			]),
			queryFn: async () => {
				const { data } = await axiosInstance.post<ListResponse>(
					"/workbench/requests",
					{
						customer_id: customerId,
						method: filters.method,
						status: filters.status,
						search: filters.search || undefined,
					},
				);
				return data;
			},
			enabled: enabled && !!customerId,
			staleTime: 30_000,
			refetchOnWindowFocus: true,
			placeholderData: (prev) => prev,
		});

	return {
		logs: data?.logs ?? [],
		unconfigured: data?.unconfigured === true,
		isLoading,
		isFetching,
		error,
		refetch,
	};
};

export const filterMethods: { value: WorkbenchMethod; label: string }[] = [
	{ value: "all", label: "All methods" },
	{ value: "GET", label: "GET" },
	{ value: "POST", label: "POST" },
	{ value: "PUT", label: "PUT" },
	{ value: "PATCH", label: "PATCH" },
	{ value: "DELETE", label: "DELETE" },
];

export const filterStatuses: { value: WorkbenchStatus; label: string }[] = [
	{ value: "all", label: "All statuses" },
	{ value: "2xx", label: "2xx" },
	{ value: "4xx", label: "4xx" },
	{ value: "5xx", label: "5xx" },
];
