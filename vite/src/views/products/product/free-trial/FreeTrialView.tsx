import { CreateFreeTrial } from "./CreateFreeTrial";
import { EditFreeTrialToolbar } from "./EditFreeTrialToolbar";
import { useProductContext } from "../ProductContext";
import { isFreeProduct } from "@/utils/product/priceUtils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { toast } from "sonner";

export const FreeTrialView = ({ product }: { product: any }) => {
	const { mutate } = useProductContext();
	const axiosInstance = useAxiosInstance();
	const [defaultTrialOpen, setDefaultTrialOpen] = useState(false);

	const isValidForDefault = () => {
		if (!product.free_trial) return false;
		// Must be paid (not free), have trial configured, and no card required
		return !isFreeProduct(product.items || []) && !product.free_trial.card_required;
	};

  const handleSetDefaultTrial = async (is_default_trial: boolean) => {
    try {
      await axiosInstance.post(`/v1/products/${product.id}/default_trial`, {
        is_default_trial,
      });
      toast.success(is_default_trial ? "Set as default trial" : "Removed as default trial");
    } catch (error: any) {
      toast.error(error.response.data.message || "Failed to update default trial");
      console.error(error);
    }
  };

	return (
		<>
			{product.free_trial && (
				<>
					<div className="flex justify-between gap-4 rounded-sm w-full">
						<div className="flex flex-col w-full gap-4">
							<div className="flex items-center w-full justify-between h-4">
								<p className="text-xs text-t3 font-medium text-center">
									Length{" "}
								</p>
								<p className="text-t2 pr-2">
									{product.free_trial.length}{" "}
									{product.free_trial.duration}
									{product.free_trial.length > 1 ? "s" : ""}
								</p>
							</div>
							<div className="flex items-center w-full justify-between h-4">
								<p className="text-xs text-t3 font-medium text-center">
									Limit by Fingerprint
								</p>
								<p className="text-t2 pr-2">
									{product.free_trial.unique_fingerprint ? (
										<span className="text-lime-600">
											True
										</span>
									) : (
										"False"
									)}
								</p>
							</div>

							<div className="flex items-center w-full justify-between h-4">
								<p className="text-xs text-t3 font-medium text-center">
									Card Required
								</p>
								<p className="text-t2 pr-2">
									{product.free_trial.card_required ? (
										<span className="text-lime-600">
											True
										</span>
									) : (
										"False"
									)}
								</p>
							</div>

							<div className="flex items-center w-full justify-between h-4">
								<p className="text-xs text-t3 font-medium text-center">
									Default Trial
								</p>
								<Popover
									open={defaultTrialOpen}
									onOpenChange={setDefaultTrialOpen}
								>
									<PopoverTrigger
										asChild
										className="p-0 py-0.5 h-fit"
									>
										<Button
											variant="outline"
											className="text-t2 px-2"
											disabled={!product.free_trial.is_default_trial && !isValidForDefault()}
										>
											{product.free_trial.is_default_trial ? (
												<span className="text-blue-600">
													True
												</span>
											) : (
												"False"
											)}
										</Button>
									</PopoverTrigger>
									<PopoverContent className="w-16 p-1" align="end">
										<div className="flex flex-col gap-1">
											<Button
												variant="ghost"
												className="text-t2 px-2 py-0"
												disabled={!isValidForDefault()}
												onClick={async () => {
													if (product.free_trial.is_default_trial) return;
														await handleSetDefaultTrial(true);
														mutate();
														setDefaultTrialOpen(false);
												}}
											>
												True
											</Button>
											<Button
												variant="ghost"
												className="text-t2 px-2 py-0"
												onClick={async () => {
													if (!product.free_trial.is_default_trial) return;									
                          await handleSetDefaultTrial(false);
                          mutate();
                          setDefaultTrialOpen(false);
												}}
											>
												False
											</Button>
										</div>
									</PopoverContent>
								</Popover>
							</div>
						</div>
					</div>
				</>
			)}
			{/* {!product.free_trial && <CreateFreeTrial />} */}
		</>
	);
};
