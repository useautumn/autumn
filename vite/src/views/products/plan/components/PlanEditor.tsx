import { useIsMobile } from "@autumn/ui";
import { motion } from "motion/react";
import { useSheet } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { SheetOverlay } from "@/components/v2/sheet-overlay/SheetOverlay";
import {
	useIsCusPlanEditor,
	useProductStore,
} from "@/hooks/stores/useProductStore";
import { CustomerPlanEditorBar } from "@/views/customers2/customer-plan/CustomerPlanEditorBar";
import { CustomerPlanInfoBox } from "@/views/customers2/customer-plan/CustomerPlanInfoBox";
import { OnboardingGuide } from "@/views/onboarding4/OnboardingGuide";
import { ProductSheets } from "../ProductSheets";
import { SHEET_ANIMATION } from "../planAnimations";
import { EditPlanHeader } from "./EditPlanHeader";
import PlanCard from "./plan-card/PlanCard";
import { LicensePlanCards } from "./plan-licenses/LicensePlanCards";
import { PendingLicenseLinksProvider } from "./plan-licenses/PendingLicenseLinksContext";
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
	const planId = useProductStore((s) => s.product.id);

	return (
		<PendingLicenseLinksProvider scope={planId ? `plan:${planId}` : undefined}>
			<div className="flex w-full h-full overflow-hidden relative">
				<motion.div
					className="h-full overflow-hidden absolute inset-0"
					animate={{
						width: isSheetOpen && !isMobile ? "calc(100% - 28rem)" : "100%",
					}}
					transition={SHEET_ANIMATION}
				>
					{/* pb matches PlanEditorBar's h-40 so the last card scrolls clear of it */}
					<div className="flex flex-col justify-start h-full w-full overflow-x-hidden overflow-y-auto pb-40">
						<div className="w-full max-w-5xl mx-auto pt-4 sm:pt-8 px-4 sm:px-10">
							<OnboardingGuide />
						</div>
						<div onClick={(e) => e.stopPropagation()}>
							<EditPlanHeader />
						</div>
						<div className="flex flex-col w-full h-fit items-center justify-start pt-20 px-4 sm:px-10 gap-4">
							{isCusPlanEditor && <CustomerPlanInfoBox />}
							<PlanCard />
							{/* Link License lives in the plan toolbar (top right); the
								inline button is customize-editor-only. */}
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
		</PendingLicenseLinksProvider>
	);
};
