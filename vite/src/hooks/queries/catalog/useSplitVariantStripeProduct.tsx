import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

export const useSplitVariantStripeProduct = () => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const buildKey = useQueryKeyFactory();

	return useMutation({
		mutationFn: async (variantPlanId: string) => {
			const { data } = await axiosInstance.post(
				"/v1/plans.split_variant_stripe_product",
				{ variant_plan_id: variantPlanId },
			);
			return data;
		},
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: buildKey(["catalog-mappings"]),
				}),
				queryClient.invalidateQueries({ queryKey: ["products"] }),
				queryClient.invalidateQueries({ queryKey: ["product"] }),
			]);
			toast.success("Created a separate Stripe product");
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to create Stripe product"));
		},
	});
};
