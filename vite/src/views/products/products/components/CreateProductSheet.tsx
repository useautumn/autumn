import {
	ProductCatalogType,
	type ProductV2,
	productV2ToBasePrice,
} from "@autumn/shared";
import { Sheet, SheetContent, ShortcutButton } from "@autumn/ui";
import type { AxiosError } from "axios";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
	SheetFooter,
	SheetHeader,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useLicenseProductsQuery } from "@/hooks/queries/useLicenseProductsQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr, navigateTo } from "@/utils/genUtils";
import { AdditionalOptions } from "../../plan/components/edit-plan-details/AdditionalOptions";
import { BasePriceSection } from "../../plan/components/edit-plan-details/BasePriceSection";
import { MoreSettingsSection } from "../../plan/components/edit-plan-details/MoreSettingsSection";
import { PlanTypeSection } from "../../plan/components/edit-plan-details/PlanTypeSection";
import { DEFAULT_PRODUCT } from "../../plan/utils/defaultProduct";
import { CreateProductMainDetails } from "./CreateProductMainDetails";

function CreateProductSheet({
	onSuccess,
	open: controlledOpen,
	onOpenChange: controlledOnOpenChange,
	isAddOn = false,
	catalogType = ProductCatalogType.Plan,
}: {
	onSuccess?: (newProduct: ProductV2) => Promise<void>;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	isAddOn?: boolean;
	catalogType?: ProductCatalogType;
}) {
	const isLicense = catalogType === ProductCatalogType.License;

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
	const { invalidate, products } = useProductsQuery();
	const { invalidate: invalidateLicenses } = useLicenseProductsQuery({
		enabled: false,
	});

	const handleCreateClicked = async () => {
		const productName = product.name?.trim() || "";

		if (!productName) {
			toast.error(`${isLicense ? "License" : "Plan"} name is required`);
			return;
		}

		setLoading(true);
		try {
			const newProduct = await ProductService.createProduct(
				axiosInstance,
				product,
			);

			invalidate();
			if (isLicense) invalidateLicenses();

			if (onSuccess) {
				await onSuccess(newProduct);
			} else {
				navigateTo(`/products/${newProduct.id}`, navigate);
			}
			setOpen(false);
		} catch (error) {
			toast.error(
				getBackendErr(
					error as AxiosError,
					`Failed to create ${isLicense ? "license" : "plan"}`,
				),
			);
		}
		setLoading(false);
	};

	const handleCancel = () => {
		setOpen(false);
	};

	const isFirstPlan = !products || products.length === 0;

	useEffect(() => {
		if (open) {
			reset();
			setProduct({
				...DEFAULT_PRODUCT,
				is_add_on: isAddOn,
				is_default: isFirstPlan && !isAddOn && !isLicense,
				catalog_type: catalogType,
			});
		}
	}, [open, reset, setProduct, isAddOn, isFirstPlan, isLicense, catalogType]);

	const headerTitle = isLicense
		? "Create License"
		: isAddOn
			? "Create Add-on Plan"
			: "Create Plan";

	const headerDescription = isLicense
		? "Create a license subplan that can be offered on a plan and assigned to entities"
		: isAddOn
			? "Create a new add-on plan that can be purchased alongside base plans"
			: "Create a new free or paid plan for your application";

	const submitLabel = isLicense
		? "Create license"
		: isAddOn
			? "Create add-on plan"
			: "Create plan";

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetContent className="flex flex-col overflow-hidden bg-background">
				<SheetHeader
					title={headerTitle}
					description={headerDescription}
					noSeparator={true}
				/>

				<div className="flex-1 overflow-y-auto">
					<CreateProductMainDetails />
					<PlanTypeSection />
					<BasePriceSection className="pb-1" />
					<AdditionalOptions withSeparator={false} />
					<MoreSettingsSection />
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
						{submitLabel}
					</ShortcutButton>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

export default CreateProductSheet;
