import PricingTable from "@/components/autumn/pricing-table";
import { EditProduct } from "./EditProduct";
import { useEffect, useState } from "react";

import { getBackendErr, nullish } from "@/utils/genUtils";
import { Feature, Product } from "autumn-js";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowRight, PlusIcon } from "lucide-react";
import {
	ModelPricingContext,
	useModelPricingContext,
} from "./ModelPricingContext";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { slugify } from "@/utils/formatUtils/formatTextUtils";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { toast } from "sonner";
import { ProductsContext } from "@/views/products/ProductsContext";
import { SelectEditProduct } from "./SelectEditProduct";
import { ConnectStripeStep } from "../integrate/ConnectStripeStep";
import { AutumnProvider } from "autumn-js/react";
import { useProductData } from "@/views/products/product/hooks/useProductData";
import ConnectStripeDialog from "../ConnectStripeDialog";
import { useOnboardingQueryState } from "../hooks/useOnboardingQueryState";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { ProductV2 } from "@autumn/shared";
import { useOrg } from "@/hooks/common/useOrg";
import { useProductContext } from "@/views/products/product/ProductContext";

const defaultProduct = {
	id: "",
	name: "",
	items: [],
	is_default: false,
	is_add_on: false,
	free_trial: null,
};

export const ModelPricing = ({
	// data,
	// mutate,
	// mutateAutumnProducts,
	refetchAutumnProducts,
	autumnProducts,
	// productCounts,
	// mutateCounts,
	// queryStates,
	// setQueryStates,
}: {
	// data: any;
	// mutate: any;
	// mutateAutumnProducts: any;
	refetchAutumnProducts: any;
	autumnProducts: Product[];
	// productCounts: any;
	// mutateCounts: any;
	// queryStates: any;
	// setQueryStates: any;
}) => {
	const { queryStates, setQueryStates } = useOnboardingQueryState();
	const { products, refetch } = useProductsQuery();

	const getCurProduct = () => {
		if (queryStates.productId) {
			const prod = products.find(
				(p: ProductV2) => p.id === queryStates.productId,
			);

			if (prod) return prod;
		}

		if (products.length > 0) return products[0];

		return defaultProduct;
	};

	const curProduct = getCurProduct();

	const firstItemCreated = autumnProducts.some(
		(p: Product) => p.items.length > 0,
	);

	const [editingNewProduct, setEditingNewProduct] = useState(
		nullish(curProduct),
	);

	const [connectStripeOpen, setConnectStripeOpen] = useState(false);

	const productDataState = useProductData({
		originalProduct: curProduct as any,
	});

	const { product } = productDataState;

	useEffect(() => {
		if (curProduct && !queryStates.productId) {
			setQueryStates({
				productId: curProduct.id,
			});
		}
	}, [curProduct]);

	if (!product) return null;

	return (
		<ModelPricingContext.Provider
			value={{
				firstItemCreated,
				// setFirstItemCreated,
				editingNewProduct,
				setEditingNewProduct,

				// For <EditProduct />
				productDataState,

				// For <CheckoutDialog /> & <NewProductPopover />
				refetch: async () => {
					await Promise.all([refetch(), refetchAutumnProducts()]);
				},

				// product,
				// setProduct,
				// mutate,
				// data,
				// productCount: productCounts?.[product?.id ?? ""],
				// queryStates,
				// setQueryStates,
				// mutateAutumnProducts,
				// mutateCounts,
				setConnectStripeOpen,
			}}
		>
			<ConnectStripeDialog
				open={connectStripeOpen}
				setOpen={setConnectStripeOpen}
			/>

			<div className="flex flex-col w-full h-full items-center justify-between overflow-y-auto overflow-x-hidden">
				<div className="w-full p-10 flex flex-col gap-4 justify-center items-center">
					<div className="max-w-[800px] w-full">
						<div className="flex gap-4 items-center justify-between mb-6">
							<div className="flex flex-col gap-1">
								<p className="text-xl font-medium">Create your products</p>
								<p className="text-t2 text-sm w-md">
									To start, model your app's pricing by creating a product for
									your free plans, paid plans and any add-ons or top-ups.
								</p>
							</div>
							{firstItemCreated && (
								<div className="flex gap-0 items-center">
									<SelectEditProduct />
									{products.length > 0 && <NewProductPopover />}
								</div>
							)}
						</div>
						<div className="flex flex-col gap-4 w-full">
							<EditProduct refetchAutumnProducts={refetchAutumnProducts} />
						</div>
					</div>
				</div>

				<div className="w-full">
					<div
						className={cn(
							"w-full px-10 flex flex-col gap-4 items-center ",
							"transition-all duration-800 overflow-hidden py-10 pb-4",
							!firstItemCreated && "hidden",
							// firstItemCreated ? "max-h-[800px] py-10" : "max-h-0 py-0"
						)}
					>
						<AutumnProvider
							backendUrl={`${import.meta.env.VITE_BACKEND_URL}/demo`}
							includeCredentials={true}
						>
							<div className="gap-8 flex justify-center max-w-[800px] w-full flex-col">
								<PricingTable
									products={autumnProducts}
									setConnectStripeOpen={setConnectStripeOpen}
								/>
							</div>
						</AutumnProvider>

						<div className="w-full flex justify-end translate-x-6">
							<Button
								onClick={() => {
									setQueryStates({
										page: "integrate",
									});
								}}
								className="bg-zinc-800 w-fit hover:bg-zinc-700"
							>
								Next: Integrate Autumn <ArrowRight className="w-4 h-4" />
							</Button>
						</div>
					</div>
				</div>
			</div>
		</ModelPricingContext.Provider>
	);
};

const NewProductPopover = () => {
	const [open, setOpen] = useState(false);

	const {
		refetch,
		productDataState: { setProduct },
	} = useModelPricingContext();

	const axiosInstance = useAxiosInstance();
	const [details, setDetails] = useState({
		name: "",
		id: "",
	});

	const [creating, setCreating] = useState(false);

	const handleSave = async () => {
		try {
			setCreating(true);
			await axiosInstance.post("/v1/products", {
				name: details.name,
				id: details.id,
			});
			await refetch();
			const newProduct = {
				...defaultProduct,
				name: details.name,
				id: details.id,
			};
			setProduct(newProduct);
			setOpen(false);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to create plan"));
		} finally {
			setCreating(false);
		}
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					className="w-fit text-primary"
					onClick={async () => {}}
				>
					<PlusIcon size={14} />
					New Product
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="p-3">
				<div className="flex flex-col gap-2 text-sm">
					<p className="text-t3">New Product</p>
					<div className="flex gap-2">
						<Input
							placeholder="Name"
							value={details.name}
							onChange={(e) =>
								setDetails({
									...details,
									name: e.target.value,
									id: slugify(e.target.value),
								})
							}
						/>
						<Input placeholder="ID" disabled value={details.id} />
					</div>
					<div className="flex gap-2 justify-end w-full">
						<Button
							className="w-fit"
							variant="outline"
							// size="sm"
							onClick={handleSave}
							isLoading={creating}
						>
							Create
						</Button>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
};

// Get latest product
const getAutumnProducts = () => {
	// const curProductItems = product.items.map((item: any) =>
	//   getProductItemResponse({
	//     item,
	//     features: data.features,
	//     currency: "USD",
	//   })
	// );
	// return [product, ...autumnProducts];
	// const properties: ProductProperties = {
	//   has_trial: notNullish(product.free_trial),
	//   is_free: isFreeProduct(product.items),
	//   is_one_off: isOneOffProduct(product.items),
	//   updateable: product.items.some(
	//     (item: any) => item.usage_model == UsageModel.Prepaid
	//   ),
	// };
	// const latestProduct = {
	//   ...product,
	//   items: curProductItems,
	//   properties,
	// };
	// const curProducts = autumnProducts.filter(
	//   (p: Product) => p.id !== product.id
	// );
	// if (!firstItemCreated) {
	//   return [];
	// }
	// const newProducts = [latestProduct, ...curProducts] as any;
	// return sortProductsV2({ products: newProducts }) as Product[];
};
