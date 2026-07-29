import type { ProductV2 } from "@autumn/shared";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { pushPage } from "@/utils/genUtils";

export function useCreateVariant(product: ProductV2) {
	const navigate = useNavigate();
	const axiosInstance = useAxiosInstance();
	const { invalidate: invalidateProducts } = useProductsQuery();

	const [open, setOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [variantId, setVariantId] = useState("");
	const [variantName, setVariantName] = useState("");

	const onCreate = async () => {
		if (!(variantId.trim() && variantName.trim())) {
			toast.error("Variant ID and name are required");
			return;
		}
		setIsLoading(true);
		try {
			await ProductService.createVariant(axiosInstance, {
				base_plan_id: product.id,
				variant_plan_id: variantId.trim(),
				name: variantName.trim(),
			});
			toast.success("Variant created");
			setOpen(false);
			setVariantId("");
			setVariantName("");
			await invalidateProducts();
			pushPage({
				navigate,
				path: `/products/${variantId.trim()}`,
				preserveParams: true,
			});
		} catch (error) {
			const message = (error as { response?: { data?: { message?: string } } })
				?.response?.data?.message;
			toast.error(message ?? "Failed to create variant");
		} finally {
			setIsLoading(false);
		}
	};

	const dialogProps = {
		open,
		setOpen,
		product,
		variantId,
		setVariantId,
		variantName,
		setVariantName,
		isLoading,
		onCreate,
	};

	return { open, setOpen, dialogProps };
}
