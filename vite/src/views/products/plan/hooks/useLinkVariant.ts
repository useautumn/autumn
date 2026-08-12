import type { ProductV2 } from "@autumn/shared";
import { useState } from "react";
import { toast } from "sonner";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export function useLinkVariant(product: ProductV2) {
	const axiosInstance = useAxiosInstance();
	const { invalidate: invalidateProducts } = useProductsQuery();

	const [open, setOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [basePlanId, setBasePlanId] = useState("");

	const onLink = async () => {
		if (!basePlanId) {
			toast.error("Select a base plan");
			return;
		}
		setIsLoading(true);
		try {
			await ProductService.updateProduct(axiosInstance, product.id, {
				base_plan_id: basePlanId,
			});
			toast.success("Plan linked as variant");
			setOpen(false);
			setBasePlanId("");
			await invalidateProducts();
		} catch (error) {
			const message = (error as { response?: { data?: { message?: string } } })
				?.response?.data?.message;
			toast.error(message ?? "Failed to link variant");
		} finally {
			setIsLoading(false);
		}
	};

	const dialogProps = {
		open,
		setOpen,
		product,
		basePlanId,
		setBasePlanId,
		isLoading,
		onLink,
	};

	return { open, setOpen, dialogProps };
}
