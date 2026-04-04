import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import type { SyncMapping, SyncProposalsResponse } from "../syncStripeTypes";

export const useSyncProposals = ({ customerId }: { customerId: string }) => {
	const axiosInstance = useAxiosInstance();
	const queryKeyFactory = useQueryKeyFactory();
	const queryClient = useQueryClient();

	const proposalsQuery = useQuery({
		queryKey: queryKeyFactory(["sync-proposals", customerId]),
		queryFn: async (): Promise<SyncProposalsResponse> => {
			const { data } = await axiosInstance.post("/v1/billing.sync_proposals", {
				customer_id: customerId,
			});
			return data;
		},
		enabled: Boolean(customerId),
	});

	const syncMutation = useMutation({
		mutationFn: async ({ mappings }: { mappings: SyncMapping[] }) => {
			const apiMappings = mappings.map((mapping) => ({
				stripe_subscription_id: mapping.stripe_subscription_id,
				plan_id: mapping.plan_id,
				expire_previous: mapping.expire_previous,
				...(mapping.items ? { items: mapping.items } : {}),
			}));

			const { data } = await axiosInstance.post("/v1/billing.sync", {
				customer_id: customerId,
				mappings: apiMappings,
			});
			return data as {
				results: Array<{
					plan_id: string;
					success: boolean;
					error?: string;
				}>;
			};
		},
		onSuccess: (data) => {
			const failures = data.results.filter((r) => !r.success);
			if (failures.length > 0) {
				for (const failure of failures) {
					toast.error(`Failed to sync ${failure.plan_id}: ${failure.error}`);
				}
				return;
			}
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
