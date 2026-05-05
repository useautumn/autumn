import type { SyncParamsV1, SyncProposalsV2Response } from "@autumn/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

export const useSyncProposalsV2 = ({
	customerId,
}: {
	customerId: string;
}) => {
	const axiosInstance = useAxiosInstance();
	const queryKeyFactory = useQueryKeyFactory();
	const queryClient = useQueryClient();

	const proposalsQuery = useQuery({
		queryKey: queryKeyFactory(["sync-proposals-v2", customerId]),
		queryFn: async (): Promise<SyncProposalsV2Response> => {
			const { data } = await axiosInstance.post(
				"/v1/billing.sync_proposals_v2",
				{ customer_id: customerId },
			);
			return data;
		},
		enabled: Boolean(customerId),
	});

	const syncMutation = useMutation({
		mutationFn: async (params: SyncParamsV1) => {
			const { data } = await axiosInstance.post(
				"/v1/billing.sync_v2",
				params,
			);
			return data;
		},
		onSuccess: () => {
			toast.success("Stripe sync completed");
			queryClient.invalidateQueries({
				queryKey: queryKeyFactory(["customer"]),
			});
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to sync from Stripe"));
		},
	});

	return {
		proposals: proposalsQuery.data?.proposals ?? [],
		isLoading: proposalsQuery.isLoading,
		error: proposalsQuery.error,
		refetch: proposalsQuery.refetch,
		syncMutation,
	};
};
