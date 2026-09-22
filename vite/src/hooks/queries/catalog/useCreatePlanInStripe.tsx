import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

export const useCreatePlanInStripe = () => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const buildKey = useQueryKeyFactory();

	return useMutation({
		mutationFn: async (planId: string) => {
			const { data } = await axiosInstance.post("/v1/plans.create_in_stripe", {
				plan_id: planId,
			});
			return data;
		},
		onSuccess: async () => {
			await Promise.all([
				queryClient.refetchQueries({
					queryKey: buildKey(["catalog-mappings"]),
				}),
				queryClient.refetchQueries({ queryKey: ["products"] }),
				queryClient.refetchQueries({ queryKey: ["product"] }),
				queryClient.refetchQueries({ queryKey: ["stripe-products-resolve"] }),
			]);
			toast.success("Created the plan in Stripe");
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to create the plan in Stripe"));
		},
	});
};
