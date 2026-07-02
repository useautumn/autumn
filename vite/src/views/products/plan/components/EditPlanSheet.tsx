import { productV2ToBasePrice } from "@autumn/shared";
import {
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { SheetHeader } from "@/components/v2/sheets/InlineSheet";
import { PlanSheetFooterContainer } from "@/components/v2/sheets/PlanSheetFooterContainer";
import { AdditionalOptions } from "./edit-plan-details/AdditionalOptions";
import { MainDetailsSection } from "./edit-plan-details/MainDetailsSection";
import { MoreSettingsSection } from "./edit-plan-details/MoreSettingsSection";
import { IncludedQuantitySection } from "./plan-licenses/IncludedQuantitySection";

export function EditPlanSheet({ isOnboarding }: { isOnboarding?: boolean }) {
	const { product } = useProduct();
	const { sheetType } = useSheet();

	if (!product) return null;

	const basePrice = productV2ToBasePrice({ product });
	const showAdvanced =
		product.planType === "paid" &&
		!basePrice?.price &&
		product.basePriceType !== "usage";

	return (
		<div className="flex flex-col h-full overflow-hidden">
			<div className="flex-1 overflow-y-auto overscroll-none [scrollbar-gutter:stable]">
				{!isOnboarding && (
					<SheetHeader
						title={`Configure ${product.name ? product.name : "your new plan"}`}
						description="Configure the details of this plan"
						noSeparator={true}
					/>
				)}
				<MainDetailsSection />
				<IncludedQuantitySection />
				<AdditionalOptions />

				{!showAdvanced && <MoreSettingsSection />}
			</div>

			<PlanSheetFooterContainer sheetType={sheetType} />
		</div>
	);
}
