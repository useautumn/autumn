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
		// The route holds an org-wide lock, so variants must split one at a time.
		mutationFn: async (variantPlanIds: string[]) => {
			for (const variantPlanId of variantPlanIds) {
				await axiosInstance.post("/v1/plans.split_variant_stripe_product", {
					variant_plan_id: variantPlanId,
				});
			}
			return variantPlanIds.length;
		},
		onSuccess: async (count) => {
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: buildKey(["catalog-mappings"]),
				}),
				queryClient.invalidateQueries({ queryKey: ["products"] }),
				queryClient.invalidateQueries({ queryKey: ["product"] }),
				queryClient.invalidateQueries({
					queryKey: ["stripe-products-resolve"],
				}),
			]);
			toast.success(
				count === 1
					? "Created a separate Stripe product"
					: `Created ${count} separate Stripe products`,
			);
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to create Stripe product"));
		},
	});
};
