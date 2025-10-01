import { SheetHeader } from "@/components/v2/sheets/InlineSheet";
import { useProductContext } from "../../product/ProductContext";
import { AdditionalOptions } from "./edit-plan-details/AdditionalOptions";
import { BasePriceSection } from "./edit-plan-details/BasePriceSection";
import { FreeTrialSection } from "./edit-plan-details/FreeTrialSection";
import { MainDetailsSection } from "./edit-plan-details/MainDetailsSection";

export function EditPlanSheet() {
	const { product } = useProductContext();
	return (
		<>
			<SheetHeader
				title={`Configure ${product.name ? product.name : "your new plan"}`}
				description="Configure how this feature is used in your app"
			/>
			<MainDetailsSection />
			<BasePriceSection />

			<AdditionalOptions />
			<FreeTrialSection />
		</>
	);
}
