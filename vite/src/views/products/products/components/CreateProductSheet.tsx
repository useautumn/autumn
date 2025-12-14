import { type ProductV2, productV2ToBasePrice } from "@autumn/shared";
import type { AxiosError } from "axios";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import {
	SheetFooter,
	SheetHeader,
} from "@/components/v2/sheets/SharedSheetComponents";
import { Sheet, SheetContent } from "@/components/v2/sheets/Sheet";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr, navigateTo } from "@/utils/genUtils";
import { AdditionalOptions } from "../../plan/components/edit-plan-details/AdditionalOptions";
import { BasePriceSection } from "../../plan/components/edit-plan-details/BasePriceSection";
import { PlanTypeSection } from "../../plan/components/edit-plan-details/PlanTypeSection";
import { DEFAULT_PRODUCT } from "../../plan/utils/defaultProduct";
import { CreateProductMainDetails } from "./CreateProductMainDetails";

function CreateProductSheet({
	onSuccess,
	open: controlledOpen,
	onOpenChange: controlledOnOpenChange,
}: {
	onSuccess?: (newProduct: ProductV2) => Promise<void>;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}) {
	const [loading, setLoading] = useState(false);
	const [internalOpen, setInternalOpen] = useState(false);

	const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
	const setOpen = controlledOnOpenChange || setInternalOpen;

	const product = useProductStore((s) => s.product);
	const basePrice = productV2ToBasePrice({ product });

	const setProduct = useProductStore((s) => s.setProduct);
	const reset = useProductStore((s) => s.reset);

	const axiosInstance = useAxiosInstance();
	const navigate = useNavigate();

	const handleCreateClicked = async () => {
		const productName = product.name?.trim() || "";

		if (!productName) {
			toast.error("Plan name is required");
			return;
		}

		setLoading(true);
		try {
			const newProduct = await ProductService.createProduct(
				axiosInstance,
				product,
			);

			if (onSuccess) {
				await onSuccess(newProduct);
			} else {
				navigateTo(`/products/${newProduct.id}`, navigate);
			}
			setOpen(false);
		} catch (error) {
			toast.error(getBackendErr(error as AxiosError, "Failed to create plan"));
		}
		setLoading(false);
	};

	const handleCancel = () => {
		setOpen(false);
	};

	// Reset product state when sheet opens/closes
	useEffect(() => {
		if (open) {
			reset();
			setProduct(DEFAULT_PRODUCT);
		}
	}, [open, reset, setProduct]);

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			{/* <SheetTrigger asChild>
				<Button variant="add" className="w-full">
					Plan
				</Button>
			</SheetTrigger> */}
			<SheetContent className="flex flex-col overflow-hidden bg-background">
				<SheetHeader
					title="Create Plan"
					description="Create a new free or paid plan for your application"
					noSeparator={true}
				/>

				<div className="flex-1 overflow-y-auto">
					<CreateProductMainDetails />
					<PlanTypeSection />
					<BasePriceSection />
					<AdditionalOptions withSeparator={false} hideAddOn={true} />
				</div>

				<SheetFooter>
					<ShortcutButton
						variant="secondary"
						className="w-full"
						onClick={handleCancel}
						singleShortcut="escape"
					>
						Cancel
					</ShortcutButton>
					<ShortcutButton
						disabled={
							(product.planType === "paid" &&
								product.basePriceType !== "usage" &&
								!basePrice?.price) ||
							!product.name ||
							!product.id ||
							!product.planType
						}
						className="w-full"
						onClick={handleCreateClicked}
						metaShortcut="enter"
						isLoading={loading}
					>
						Create plan
					</ShortcutButton>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

export default CreateProductSheet;
