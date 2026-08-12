import type { ProductV2 } from "@autumn/shared";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

export function useDetachVariant(product: ProductV2) {
	const axiosInstance = useAxiosInstance();
	const { invalidate: invalidateProducts } = useProductsQuery();

	const [open, setOpen] = useState(false);

	const { mutate: detachFromBasePlan, isPending: isLoading } = useMutation({
		mutationFn: async () => {
			await ProductService.updateProduct(axiosInstance, product.id, {
				base_plan_id: null,
			});
		},
		onSuccess: async () => {
			toast.success("Plan detached from its base");
			setOpen(false);
			await invalidateProducts();
		},
		onError: (error) =>
			toast.error(getBackendErr(error, "Failed to detach variant")),
	});

	const dialogProps = {
		open,
		setOpen,
		product,
		isLoading,
		onDetach: () => detachFromBasePlan(),
	};

	return { open, setOpen, dialogProps };
}
