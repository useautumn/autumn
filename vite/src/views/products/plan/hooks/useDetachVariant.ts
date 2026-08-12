import type { ProductV2 } from "@autumn/shared";
import { useState } from "react";
import { toast } from "sonner";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export function useDetachVariant(product: ProductV2) {
	const axiosInstance = useAxiosInstance();
	const { invalidate: invalidateProducts } = useProductsQuery();

	const [open, setOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(false);

	const onDetach = async () => {
		setIsLoading(true);
		try {
			await ProductService.updateProduct(axiosInstance, product.id, {
				base_plan_id: null,
			});
			toast.success("Plan detached from its base");
			setOpen(false);
			await invalidateProducts();
		} catch (error) {
			const message = (error as { response?: { data?: { message?: string } } })
				?.response?.data?.message;
			toast.error(message ?? "Failed to detach variant");
		} finally {
			setIsLoading(false);
		}
	};

	const dialogProps = { open, setOpen, product, isLoading, onDetach };

	return { open, setOpen, dialogProps };
}
