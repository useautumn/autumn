import { useEffect, useState } from "react";
import { toast } from "sonner";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { InfoTooltip } from "@/components/general/modal-components/InfoTooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { slugify } from "@/utils/formatUtils/formatTextUtils";
import { getBackendErr } from "@/utils/genUtils";
import { useProductContext } from "@/views/products/product/ProductContext";
import { useModelPricingContext } from "../ModelPricingContext";
import { handleAutoSave } from "../model-pricing-utils/modelPricingUtils";

export const EditProductDetails = () => {
	const { productDataState } = useModelPricingContext();
	const { product, setProduct } = productDataState;

	const { products, refetch } = useProductsQuery();

	const allowCreate = products.length === 0;
	const { autoSave } = useProductContext();
	const [createLoading, setCreateLoading] = useState(false);

	const axiosInstance = useAxiosInstance();
	const [details, setDetails] = useState({
		name: product?.name,
		id: product?.id,
	});

	useEffect(() => {
		if (product.id) {
			setDetails({
				name: product.name,
				id: product.id,
			});
		}
	}, [product]);

	const handleCreateProduct = async () => {
		setCreateLoading(true);
		try {
			await axiosInstance.post("/v1/products", {
				name: details.name,
				id: details.id,
			});
			await refetch();
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to create plan"));
		} finally {
			setCreateLoading(false);
		}
	};

	return (
		<div className="flex gap-2 items-end">
			<div>
				<FieldLabel className="text-t2 font-medium">Product Name</FieldLabel>
				<Input
					onBlur={async () => {
						if (autoSave && !allowCreate) {
							await handleAutoSave({
								axiosInstance,
								productId: product.id ? product.id : details.id,
								product: {
									...product,
									name: details.name,
									id: details.id,
								},
								refetch,
							});
						}
						setProduct({
							...product,
							name: details.name,
							id: details.id,
						});
					}}
					placeholder="Eg. Free Product"
					value={details.name}
					onChange={(e) => {
						const newIdData = allowCreate
							? {
									id: slugify(e.target.value),
								}
							: {};
						setDetails({
							...details,
							name: e.target.value,
							...newIdData,
						});
					}}
				/>
			</div>
			<div>
				<div className="flex gap-1 items-center mb-2">
					<FieldLabel className="text-t2 font-medium mb-0">
						Product ID
					</FieldLabel>
					<InfoTooltip>
						<p>
							The product ID is used to identify the product in the API when
							you're making a payment.
						</p>
					</InfoTooltip>
				</div>

				<Input
					value={details.id}
					disabled={!allowCreate}
					onChange={(e) => {
						setDetails({
							...details,
							id: e.target.value,
						});
					}}
					placeholder="Eg. free_plan"
				/>
			</div>
			{allowCreate && (
				<Button onClick={handleCreateProduct} shimmer={createLoading}>
					Create Product
				</Button>
			)}
		</div>
	);
};
