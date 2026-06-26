import {
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { SheetHeader } from "@/components/v2/sheets/InlineSheet";
import { PlanSheetFooterContainer } from "@/components/v2/sheets/PlanSheetFooterContainer";
import { BasePriceSection } from "./edit-plan-details/BasePriceSection";
import { PlanTypeSection } from "./edit-plan-details/PlanTypeSection";

export function EditPlanPriceSheet({
	isOnboarding,
	hideFooter,
}: {
	isOnboarding?: boolean;
	hideFooter?: boolean;
}) {
	const { product } = useProduct();
	const { sheetType } = useSheet();

	if (!product) return null;

	return (
		<div className="flex flex-col h-full overflow-hidden">
			<div className="flex-1 overflow-y-auto overscroll-none [scrollbar-gutter:stable]">
				{!isOnboarding && (
					<SheetHeader
						title={`Configure ${product.name ? `${product.name} ` : ""}Price`}
						description="Set whether this plan is free or paid, and configure a base price"
					/>
				)}
				<PlanTypeSection />
				<BasePriceSection withSeparator={false} />
			</div>

			{!hideFooter && <PlanSheetFooterContainer sheetType={sheetType} />}
		</div>
	);
}
