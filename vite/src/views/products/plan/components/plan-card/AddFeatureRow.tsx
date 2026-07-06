import { isLicenseProduct } from "@autumn/shared";
import { Button } from "@autumn/ui";
import { PlusIcon } from "@phosphor-icons/react";
import {
	useCurrentItem,
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { cn } from "@/lib/utils";
import { checkItemIsValid } from "@/utils/product/entitlementUtils";
import { useOpenAddFeatureSheet } from "../../hooks/useOpenAddFeatureSheet";

export const AddFeatureRow = () => {
	const item = useCurrentItem();
	const { product } = useProduct();
	const openAddFeatureSheet = useOpenAddFeatureSheet();
	const { sheetType } = useSheet();
	const isSelecting = sheetType === "select-feature";
	const targetLabel = isLicenseProduct({ product }) ? "License" : "Plan";

	return (
		<Button
			variant="dotted"
			className={cn(
				"group !rounded-xl !bg-transparent w-full !h-9 !border-dashed !text-primary [&_svg]:text-primary hover:!border-primary !border-primary/50 active:!border-primary focus-visible:!bg-primary/5 focus-visible:!border-dashed [data-state='open']:!bg-primary/5 z-95 hover:relative",
				isSelecting &&
					"relative z-95 !opacity-100 !border-primary !bg-primary/5 outline-4 outline-outer-background",
			)}
			onClick={() => {
				if (!checkItemIsValid(item!)) return;
				openAddFeatureSheet();
			}}
			aria-label="Add new feature"
		>
			<PlusIcon className="size-3 !text-primary" weight="bold" />
			<span className="!text-primary">Add Feature to {targetLabel}</span>
		</Button>
	);
};
