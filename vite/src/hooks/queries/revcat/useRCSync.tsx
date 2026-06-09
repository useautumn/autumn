import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export interface RCSyncAppResult {
	app_id: string;
	app_type: string;
	product: "created" | "updated" | "exists";
	store_push?: "pushed" | "failed" | "skipped";
	message?: string;
}

export interface RCSyncResult {
	plan_id: string;
	status: "synced" | "skipped" | "error";
	store_identifier?: string;
	apps?: RCSyncAppResult[];
	message?: string;
}

export const useRCSync = () => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const buildKey = useQueryKeyFactory();

	const mutation = useMutation({
		mutationFn: async (productIds: string[]) => {
			const { data } = await axiosInstance.post<{ results: RCSyncResult[] }>(
				"/v1/organization/revenuecat/sync",
				{ product_ids: productIds },
			);
			return data.results;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: buildKey(["revenuecat-mappings"]),
			});
		},
	});

	return { sync: mutation.mutateAsync, isSyncing: mutation.isPending };
};
