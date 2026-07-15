import { type ProductV2, productV2ToBasePrice } from "@autumn/shared";
import { Sheet, SheetContent, ShortcutButton } from "@autumn/ui";
import type { AxiosError } from "axios";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
	ProductProvider,
	useProduct,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { useInlineProductEditor } from "@/components/v2/inline-custom-plan-editor/useInlineProductEditor";
import {
	SheetFooter,
	SheetHeader,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { ProductService } from "@/services/products/ProductService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr, navigateTo } from "@/utils/genUtils";
import { AdditionalOptions } from "../../plan/components/edit-plan-details/AdditionalOptions";
import { BasePriceSection } from "../../plan/components/edit-plan-details/BasePriceSection";
import { MoreSettingsSection } from "../../plan/components/edit-plan-details/MoreSettingsSection";
import { PlanTypeSection } from "../../plan/components/edit-plan-details/PlanTypeSection";
import { DEFAULT_PRODUCT } from "../../plan/utils/defaultProduct";
import { CreateProductMainDetails } from "./CreateProductMainDetails";

type CreateProductSheetProps = {
	onSuccess?: (newProduct: ProductV2) => Promise<void>;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	isAddOn?: boolean;
	/** License variant: retitles the sheet and hides trial/add-on/settings —
	 * licenses are plain plans offered for assignment under a parent. */
	isLicense?: boolean;
};

const sheetCopy = ({
	isAddOn,
	isLicense,
}: {
	isAddOn: boolean;
	isLicense: boolean;
}) => {
	if (isLicense) {
		return {
			title: "Create License",
			description:
				"Licenses are plans offered under a parent plan. Customers assign them to entities, and each assigned entity receives the license's features.",
			submit: "Create license",
		};
	}
	if (isAddOn) {
		return {
			title: "Create Add-on Plan",
			description:
				"Create a new add-on plan that can be purchased alongside base plans",
			submit: "Create add-on plan",
		};
	}
	return {
		title: "Create Plan",
		description: "Create a new free or paid plan for your application",
		submit: "Create plan",
	};
};

function CreateProductSheet({
	onSuccess,
	open: controlledOpen,
	onOpenChange: controlledOnOpenChange,
	isAddOn = false,
	isLicense = false,
}: CreateProductSheetProps) {
	const [internalOpen, setInternalOpen] = useState(false);

	const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
	const setOpen = controlledOnOpenChange || setInternalOpen;

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetContent className="flex flex-col overflow-hidden bg-background">
				{/* Mounted per open so every create starts from a fresh local
				    draft — the page's product store is never touched. */}
				{open && (
					<CreateProductForm
						isAddOn={isAddOn}
						isLicense={isLicense}
						onSuccess={onSuccess}
						setOpen={setOpen}
					/>
				)}
			</SheetContent>
		</Sheet>
	);
}

function CreateProductForm({
	isAddOn,
	isLicense,
	onSuccess,
	setOpen,
}: {
	isAddOn: boolean;
	isLicense: boolean;
	onSuccess?: (newProduct: ProductV2) => Promise<void>;
	setOpen: (open: boolean) => void;
}) {
	const { products } = useProductsQuery();
	const isFirstPlan = !products || products.length === 0;

	const editor = useInlineProductEditor({
		initialProduct: {
			...DEFAULT_PRODUCT,
			is_add_on: isAddOn,
			is_default: isFirstPlan && !isAddOn && !isLicense,
		},
	});

	return (
		<ProductProvider {...editor}>
			<CreateProductFormContent
				isAddOn={isAddOn}
				isLicense={isLicense}
				onSuccess={onSuccess}
				setOpen={setOpen}
			/>
		</ProductProvider>
	);
}

function CreateProductFormContent({
	isAddOn,
	isLicense,
	onSuccess,
	setOpen,
}: {
	isAddOn: boolean;
	isLicense: boolean;
	onSuccess?: (newProduct: ProductV2) => Promise<void>;
	setOpen: (open: boolean) => void;
}) {
	const [loading, setLoading] = useState(false);
	const { product } = useProduct();
	const basePrice = productV2ToBasePrice({ product });

	const axiosInstance = useAxiosInstance();
	const navigate = useNavigate();
	const { invalidate } = useProductsQuery();

	const { title, description, submit } = sheetCopy({ isAddOn, isLicense });

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

			invalidate();

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

	return (
		<>
			<SheetHeader title={title} description={description} noSeparator={true} />

			<div className="flex-1 overflow-y-auto">
				<CreateProductMainDetails />
				<PlanTypeSection />
				<BasePriceSection className="pb-1" />
				{!isLicense && (
					<>
						<AdditionalOptions withSeparator={false} />
						<MoreSettingsSection />
					</>
				)}
			</div>

			<SheetFooter>
				<ShortcutButton
					variant="secondary"
					className="w-full"
					onClick={() => setOpen(false)}
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
					{submit}
				</ShortcutButton>
			</SheetFooter>
		</>
	);
}

export default CreateProductSheet;
