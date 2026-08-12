import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useVariantLinkVisibility } from "./useVariantLinkVisibility";

/** Neither content save path carries base_plan_id, so the link needs its own request. */
export function useApplyBasePlanLink() {
	const axiosInstance = useAxiosInstance();
	const product = useProductStore((s) => s.product);
	const setProduct = useProductStore((s) => s.setProduct);
	const { basePlanId, selectedBasePlanId } = useVariantLinkVisibility(product);
	const { invalidate: invalidateProducts } = useProductsQuery();

	const { mutateAsync } = useMutation({
		mutationFn: async (nextBasePlanId: string | null) => {
			await ProductService.updateProduct(axiosInstance, product.id, {
				base_plan_id: nextBasePlanId,
			});
		},
		onSuccess: async () => {
			// Drop the pending edit only once the list carries the persisted link,
			// otherwise the editor briefly falls back to the previous base.
			await invalidateProducts();
			setProduct({ ...useProductStore.getState().product, base_id: undefined });
		},
	});

	return async () => {
		if (selectedBasePlanId === basePlanId) return true;

		try {
			await mutateAsync(selectedBasePlanId);
			return true;
		} catch (error) {
			toast.error(
				getBackendErr(
					error,
					selectedBasePlanId
						? "Failed to link plan as a variant"
						: "Failed to detach plan from its base",
				),
			);
			return false;
		}
	};
}
