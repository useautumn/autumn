import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

export const useSplitVariantStripeProduct = () => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();
	const buildKey = useQueryKeyFactory();

	const refreshMappings = () =>
		Promise.all([
			queryClient.invalidateQueries({
				queryKey: buildKey(["catalog-mappings"]),
			}),
			queryClient.invalidateQueries({ queryKey: ["products"] }),
			queryClient.invalidateQueries({ queryKey: ["product"] }),
			queryClient.invalidateQueries({ queryKey: ["stripe-products-resolve"] }),
		]);

	return useMutation({
		// The route holds an org-wide lock, so variants must split one at a time.
		mutationFn: async (variantPlanIds: string[]) => {
			let split = 0;
			for (const variantPlanId of variantPlanIds) {
				try {
					await axiosInstance.post("/v1/plans.split_variant_stripe_product", {
						variant_plan_id: variantPlanId,
					});
					split += 1;
				} catch (error) {
					// Earlier variants are already split, so surface how far the batch got.
					throw Object.assign(error as Error, { split });
				}
			}
			return split;
		},
		onSuccess: async (count) => {
			await refreshMappings();
			toast.success(
				count === 1
					? "Created a separate Stripe product"
					: `Created ${count} separate Stripe products`,
			);
		},
		onError: async (error: Error & { split?: number }) => {
			await refreshMappings();
			const message = getBackendErr(error, "Failed to create Stripe product");
			toast.error(
				error.split
					? `Created ${error.split} of the Stripe products, then failed: ${message}`
					: message,
			);
		},
	});
};
