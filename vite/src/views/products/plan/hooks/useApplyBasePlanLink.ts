import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useVariantLinkVisibility } from "./useVariantLinkVisibility";

/**
 * Persists the editor's pending base-plan link as its own metadata-only request.
 * The content save paths carry no base_plan_id, and a minimal request also skips
 * the server's variant-settings guard.
 */
export function useApplyBasePlanLink() {
	const axiosInstance = useAxiosInstance();
	const product = useProductStore((s) => s.product);
	const { basePlanId: linkedBasePlanId } = useVariantLinkVisibility(product);
	const { invalidate: invalidateProducts } = useProductsQuery();
	const editedBasePlanId = product.base_id;

	const { mutateAsync } = useMutation({
		mutationFn: async ({
			planId,
			basePlanId,
		}: {
			planId: string;
			basePlanId: string | null;
		}) => {
			await ProductService.updateProduct(axiosInstance, planId, {
				base_plan_id: basePlanId,
			});
		},
		onSuccess: () => invalidateProducts(),
	});

	return async ({ planId }: { planId: string }) => {
		if (editedBasePlanId === undefined) return true;

		const nextBasePlanId = editedBasePlanId ?? null;
		if (nextBasePlanId === linkedBasePlanId) return true;

		try {
			await mutateAsync({ planId, basePlanId: nextBasePlanId });
			return true;
		} catch (error) {
			toast.error(
				getBackendErr(
					error,
					nextBasePlanId
						? "Failed to link plan as a variant"
						: "Failed to detach plan from its base",
				),
			);
			return false;
		}
	};
}
