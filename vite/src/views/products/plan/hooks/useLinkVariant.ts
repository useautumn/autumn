import type { ProductV2 } from "@autumn/shared";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";

export function useLinkVariant(product: ProductV2) {
	const axiosInstance = useAxiosInstance();
	const { invalidate: invalidateProducts } = useProductsQuery();

	const [open, setOpenState] = useState(false);
	const [basePlanId, setBasePlanId] = useState("");

	// Clearing on close stops a selection that has since been archived or turned
	// into a variant from resurfacing blank-but-submittable on the next open.
	const setOpen = (next: boolean) => {
		setOpenState(next);
		if (!next) setBasePlanId("");
	};

	const { mutate: linkToBasePlan, isPending: isLoading } = useMutation({
		mutationFn: async (baseId: string) => {
			await ProductService.updateProduct(axiosInstance, product.id, {
				base_plan_id: baseId,
			});
		},
		onSuccess: async () => {
			toast.success("Plan linked as variant");
			setOpen(false);
			await invalidateProducts();
		},
		onError: (error) =>
			toast.error(getBackendErr(error, "Failed to link variant")),
	});

	const onLink = () => {
		if (!basePlanId) {
			toast.error("Select a base plan");
			return;
		}
		linkToBasePlan(basePlanId);
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
