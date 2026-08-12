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
	const { basePlanId: linkedBasePlanId } = useVariantLinkVisibility(product);
	const { invalidate: invalidateProducts } = useProductsQuery();
	const editedBasePlanId = product.base_id;

	const { mutateAsync } = useMutation({
		mutationFn: async (basePlanId: string | null) => {
			await ProductService.updateProduct(axiosInstance, product.id, {
				base_plan_id: basePlanId,
			});
		},
		onSuccess: () => invalidateProducts(),
	});

	return async () => {
		if (editedBasePlanId === undefined) return true;

		const nextBasePlanId = editedBasePlanId ?? null;
		if (nextBasePlanId === linkedBasePlanId) return true;

		try {
			await mutateAsync(nextBasePlanId);
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
