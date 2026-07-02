import { useIsMobile } from "@autumn/ui";
import { motion } from "motion/react";
import { useSheet } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { SheetOverlay } from "@/components/v2/sheet-overlay/SheetOverlay";
import { useIsCusPlanEditor } from "@/hooks/stores/useProductStore";
import { CustomerPlanEditorBar } from "@/views/customers2/customer-plan/CustomerPlanEditorBar";
import { CustomerPlanInfoBox } from "@/views/customers2/customer-plan/CustomerPlanInfoBox";
import { OnboardingGuide } from "@/views/onboarding4/OnboardingGuide";
import { ProductSheets } from "../ProductSheets";
import { SHEET_ANIMATION } from "../planAnimations";
import { EditPlanHeader } from "./EditPlanHeader";
import PlanCard from "./plan-card/PlanCard";
import { LicensePlanCards } from "./plan-licenses/LicensePlanCards";
import { useIsLicenseSheetOpen } from "./plan-licenses/useLicenseSheetStore";
import { SaveChangesBar } from "./SaveChangesBar";
import { SheetPanelHost } from "./SheetPanelHost";
import { VariantPlanCards } from "./VariantPlanCards";

export const PlanEditor = () => {
	const isMobile = useIsMobile();
	const { sheetType } = useSheet();
	const isLicenseSheetOpen = useIsLicenseSheetOpen();
	const isSheetOpen = sheetType !== null || isLicenseSheetOpen;
	const isCusPlanEditor = useIsCusPlanEditor();

	return (
		<div className="flex w-full h-full overflow-hidden relative">
			<motion.div
				className="h-full overflow-hidden absolute inset-0"
				animate={{
					width: isSheetOpen && !isMobile ? "calc(100% - 28rem)" : "100%",
				}}
				transition={SHEET_ANIMATION}
			>
				<div className="flex flex-col justify-start h-full w-full overflow-x-hidden overflow-y-auto pb-20">
					<div className="w-full max-w-5xl mx-auto pt-4 sm:pt-8 px-4 sm:px-10">
						<OnboardingGuide />
					</div>
					<div onClick={(e) => e.stopPropagation()}>
						<EditPlanHeader />
					</div>
					<div className="flex flex-col w-full h-fit items-center justify-start pt-20 px-4 sm:px-10 gap-4">
						{isCusPlanEditor && <CustomerPlanInfoBox />}
						<PlanCard />
						{!isCusPlanEditor && <LicensePlanCards />}
						<VariantPlanCards />
					</div>
					<div onClick={(e) => e.stopPropagation()}>
						{isCusPlanEditor ? <CustomerPlanEditorBar /> : <SaveChangesBar />}
					</div>
				</div>
			</motion.div>

			<SheetOverlay inline />

			<ProductSheets />
			<SheetPanelHost />
		</div>
	);
};
