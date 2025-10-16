import type { ProductV2 } from "@autumn/shared";
import { UpdateProductSchema } from "@autumn/shared";
import type { AxiosError } from "axios";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";
import { ProductConfig } from "../../ProductConfig";

export const UpdateProductDialog = ({
	open,
	setOpen,
	selectedProduct,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
	selectedProduct: ProductV2;
}) => {
	const { refetch } = useProductsQuery();
	const originalProduct = useRef(selectedProduct);
	const [product, setProduct] = useState(selectedProduct);
	const [loading, setLoading] = useState(false);
	const env = useEnv();
	const axiosInstance = useAxiosInstance({ env });

	const handleSave = async () => {
		setLoading(true);
		const originalProductId = originalProduct.current.id;

		try {
			await ProductService.updateProduct(axiosInstance, originalProductId, {
				...UpdateProductSchema.parse(product),
			});
			await refetch();
			setOpen(false);

			toast.success(`Successfully updated product ${product.id}`);
		} catch (error: unknown) {
			toast.error(
				getBackendErr(error as AxiosError, "Failed to update product"),
			);
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent onClick={(e) => e.stopPropagation()}>
				<DialogHeader>
					<DialogTitle>Edit Product</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<ProductConfig
						product={product}
						setProduct={setProduct}
						isUpdate={true}
					/>
				</div>
				<DialogFooter>
					<Button variant="secondary" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button variant="primary" onClick={handleSave} isLoading={loading}>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
