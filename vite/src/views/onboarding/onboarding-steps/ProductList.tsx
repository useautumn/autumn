import {
	Product,
	type ProductItem,
	type ProductV2,
	products,
} from "@autumn/shared";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import Step from "@/components/general/OnboardingStep";
import { PageSectionHeader } from "@/components/general/PageSectionHeader";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { getBackendErr } from "@/utils/genUtils";
import { ProductsContext } from "@/views/products/ProductsContext";
import { CreateFreeTrial } from "@/views/products/product/free-trial/CreateFreeTrial";
import { ManageProduct } from "@/views/products/product/ManageProduct";
import { ProductContext } from "@/views/products/product/ProductContext";
import CreateProduct from "@/views/products/products/components/CreateProductDialog";
import { ProductsTable } from "@/views/products/products/components/ProductsTable";

export const ProductList = ({
	data,
	mutate,
}: {
	data: any;
	mutate: () => Promise<void>;
}) => {
	const env = useEnv();

	const [searchParams] = useSearchParams();
	const token = searchParams.get("token");

	const [product, setProduct] = useState<any>(data.products[0]);
	const [features, setFeatures] = useState<any[]>(data.features);
	const [open, setOpen] = useState(false);
	const [originalProduct, setOriginalProduct] = useState<any>(null);
	const [entityFeatureIds, setEntityFeatureIds] = useState<string[]>([]);

	useEffect(() => {
		setFeatures(data.features);
		setEntityFeatureIds(
			Array.from(
				new Set(
					product?.items
						.filter((item: ProductItem) => item.entity_feature_id != null)
						.map((item: ProductItem) => item.entity_feature_id),
				),
			),
		);
	}, [data.features, product]);

	if (!data.products) return null;

	return (
		<Step
			title={
				token || data.products.length > 0
					? "Your products"
					: "Create your products"
			}
			number={1}
			description={
				<p>
					Create products for any free products, paid products and any add-on or
					top up products that your application offers.
				</p>
			}
		>
			<EditProductDialog
				product={product}
				setProduct={setProduct}
				features={features}
				setFeatures={setFeatures}
				mutate={mutate}
				open={open}
				setOpen={setOpen}
				originalProduct={originalProduct}
				entityFeatureIds={entityFeatureIds}
				setEntityFeatureIds={setEntityFeatureIds}
			/>
			<ProductsContext.Provider
				value={{
					products,
					env,
					onboarding: true,
					mutate,
					entityFeatureIds,
					setEntityFeatureIds,
				}}
			>
				<PageSectionHeader
					title="Products"
					isOnboarding={true}
					addButton={
						<>
							{/* <Button variant="add">Test Data</Button> */}
							<CreateProduct
								onSuccess={async (newProduct: ProductV2) => {
									await mutate();
									setProduct(newProduct);
									setOpen(true);
								}}
							/>
						</>
					}
					className="pr-0 border-l"
				/>

				<ProductsTable
					onRowClick={(id) => {
						const selectedProduct = data.products.find(
							(p: ProductV2) => p.id === id,
						);
						setProduct(selectedProduct);
						// setEntityFeatureIds([]);
						setOriginalProduct(JSON.parse(JSON.stringify(selectedProduct)));
						setOpen(true);
					}}
				/>
			</ProductsContext.Provider>
		</Step>
	);
};

export const EditProductDialog = ({
	product,
	features,
	setProduct,
	setFeatures,
	mutate,
	open,
	setOpen,
	originalProduct,
	entityFeatureIds,
	setEntityFeatureIds,
}: {
	product: any;
	setProduct: (product: any) => void;
	features: any[];
	setFeatures: (features: any[]) => void;
	mutate: () => Promise<void>;
	open: boolean;
	setOpen: (open: boolean) => void;
	originalProduct: any;
	entityFeatureIds: string[];
	setEntityFeatureIds: (entityFeatureIds: string[]) => void;
}) => {
	const env = useEnv();
	const axiosInstance = useAxiosInstance();
	const [createProductLoading, setCreateProductLoading] = useState(false);
	const [freeTrialModalOpen, setFreeTrialModalOpen] = useState(false);

	// Store the original product state when modal opens
	const handleOpenChange = async (newOpen: boolean) => {
		if (!newOpen && open && product?.id) {
			// Modal is being closed, check if there are changes
			const hasChanges =
				originalProduct &&
				JSON.stringify(product) !== JSON.stringify(originalProduct);

			if (hasChanges) {
				// Only update if there are changes
				updateProduct();
			}
		}
		setOpen(newOpen);
	};

	const updateProduct = async () => {
		setCreateProductLoading(true);
		try {
			const res = await ProductService.updateProduct(
				axiosInstance,
				product.id,
				product,
			);
			toast.success("Product updated successfully");
			await mutate();
			setOpen(false);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to update product"));
		}
		setCreateProductLoading(false);
	};

	const handleFreeTrialClick = () => {
		if (product?.free_trial) {
			// Delete the free trial
			setProduct({ ...product, free_trial: null });
		} else {
			// Open the free trial modal
			setFreeTrialModalOpen(true);
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="p-0 py-8 min-w-[500px] min-h-[300px] flex flex-col justify-between">
				<DialogTitle className="text-t2 font-semibold px-10 hidden">
					{/* Edit Product */}
				</DialogTitle>
				<div>
					<ProductContext.Provider
						value={{
							product,
							setProduct,
							mutate,
							env,
							features,
							setFeatures,
							entityFeatureIds,
							setEntityFeatureIds,
						}}
					>
						<CreateFreeTrial
							open={freeTrialModalOpen}
							setOpen={setFreeTrialModalOpen}
						/>
						<ManageProduct hideAdminHover={true} />
					</ProductContext.Provider>
				</div>
				<DialogFooter>
					<div className="flex justify-between items-center gap-2 px-10 w-full mt-6">
						<div className="flex gap-2">
							<Tooltip delayDuration={200}>
								<TooltipTrigger asChild>
									<Button
										variant="outline"
										disabled={product?.is_add_on}
										onClick={() =>
											setProduct({
												...product,
												is_default: !product?.is_default,
											})
										}
										className={`min-w-32 flex items-center gap-2 ${
											product?.is_default ? "bg-stone-100" : ""
										}`}
									>
										{product?.is_default && (
											<div className="w-3 h-3 bg-lime-500 rounded-full flex items-center justify-center">
												<Check className="w-2 h-2 text-white" />
											</div>
										)}
										Default
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									This product is enabled by default for all new users
								</TooltipContent>
							</Tooltip>
							<Tooltip delayDuration={200}>
								<TooltipTrigger asChild>
									<Button
										variant="outline"
										disabled={product?.is_default}
										onClick={() =>
											setProduct({ ...product, is_add_on: !product?.is_add_on })
										}
										className={`min-w-32 flex items-center gap-2 ${
											product?.is_add_on ? "bg-stone-100" : ""
										}`}
									>
										{product?.is_add_on && (
											<div className="w-3 h-3 bg-lime-500 rounded-full flex items-center justify-center">
												<Check className="w-2 h-2 text-white" />
											</div>
										)}
										Add-on
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									This product is an add-on that can be bought together with
									your base products
								</TooltipContent>
							</Tooltip>
							<Button
								variant="outline"
								onClick={handleFreeTrialClick}
								className={`min-w-32 flex items-center gap-2 ${
									product?.free_trial ? "bg-stone-100" : ""
								}`}
							>
								{product?.free_trial && (
									<div className="w-3 h-3 bg-lime-500 rounded-full flex items-center justify-center">
										<Check className="w-2 h-2 text-white" />
									</div>
								)}
								Free Trial
							</Button>
						</div>
						<Button
							isLoading={createProductLoading}
							variant="gradientPrimary"
							onClick={updateProduct}
							className="min-w-44 w-44 max-w-44"
						>
							Update Product
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
		</Dialog>
	);
};
