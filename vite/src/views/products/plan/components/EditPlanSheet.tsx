import { SheetHeader } from "@/components/v2/sheets/InlineSheet";
import { AdditionalOptions } from "./edit-plan-details/AdditionalOptions";
import { BasePriceSection } from "./edit-plan-details/BasePriceSection";
import { FreeTrialSection } from "./edit-plan-details/FreeTrialSection";
import { MainDetailsSection } from "./edit-plan-details/MainDetailsSection";

export function EditPlanSheet() {
	return (
		<>
			<SheetHeader
				title="New Plan"
				description="Configure how this feature is used in your app"
			/>
			<MainDetailsSection />
			<BasePriceSection />

			<AdditionalOptions />
			<FreeTrialSection />
		</>
	);
}
