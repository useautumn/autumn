import { PlusIcon, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { CreateFreeTrial } from "@/views/products/product/free-trial/CreateFreeTrial";
import { useProductContext } from "@/views/products/product/ProductContext";
import { handleAutoSave } from "./model-pricing-utils/modelPricingUtils";

export const AddTrialButton = () => {
	const axiosInstance = useAxiosInstance();
	const { product, setProduct, autoSave, refetch } = useProductContext();
	const [open, setOpen] = useState(false);

	return (
		<>
			<CreateFreeTrial open={open} setOpen={setOpen} />
			<Button
				variant="ghost"
				onClick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					setOpen(true);
				}}
				className="justify-start w-fit p-0 hover:bg-transparent text-t2 font-medium hover:text-t1"
			>
				{product?.free_trial ? (
					<div className="flex items-center gap-2 justify-between w-full">
						<p className="text-lime-600">
							{product?.free_trial?.length} {product.free_trial?.duration} trial
						</p>
						<Button
							variant="ghost"
							size="icon"
							isIcon
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								setProduct({
									...product,
									free_trial: null,
								});

								if (autoSave) {
									handleAutoSave({
										axiosInstance,
										productId: product.id,
										product: { ...product, free_trial: null },
										refetch,
									});
								}
							}}
							className="hover:bg-zinc-300 !h-4 !w-4 text-t3 mt-0.5"
						>
							<X size={12} />
						</Button>
					</div>
				) : (
					<p className="flex items-center gap-2">
						Add Free Trial
						<PlusIcon size={16} />
					</p>
				)}
			</Button>
		</>
	);
};
