import { motion } from "motion/react";
import { SheetOverlay } from "@/components/v2/sheet-overlay/SheetOverlay";
import { useIsCusPlanEditor } from "@/hooks/stores/useProductStore";
import { useIsSheetOpen } from "@/hooks/stores/useSheetStore";
import { CustomerPlanEditorBar } from "@/views/customers2/customer-plan/CustomerPlanEditorBar";
import { CustomerPlanInfoBox } from "@/views/customers2/customer-plan/CustomerPlanInfoBox";
import { OnboardingGuide } from "@/views/onboarding4/OnboardingGuide";
import { ProductSheets } from "../ProductSheets";
import { SHEET_ANIMATION } from "../planAnimations";
import { EditPlanHeader } from "./EditPlanHeader";
import PlanCard from "./plan-card/PlanCard";
import { SaveChangesBar } from "./SaveChangesBar";

export const PlanEditor = () => {
	const isSheetOpen = useIsSheetOpen();

	return (
		<div className="flex w-full h-full overflow-hidden relative">
			<motion.div
				className="h-full overflow-hidden absolute inset-0"
				animate={{
					width: isSheetOpen ? "calc(100% - 28rem)" : "100%",
				}}
				transition={SHEET_ANIMATION}
			>
				<div className="flex flex-col justify-start h-full w-full overflow-x-hidden overflow-y-auto pb-20">
					<div className="w-full max-w-5xl mx-auto pt-8 px-10">
						<OnboardingGuide collapseAll={isSheetOpen} />
					</div>
					<div onClick={(e) => e.stopPropagation()}>
						<EditPlanHeader />
					</div>
					<div className="flex flex-col w-full h-fit items-center justify-start pt-20 px-10 gap-4">
						{useIsCusPlanEditor() && <CustomerPlanInfoBox />}
						<PlanCard />
					</div>
					<div onClick={(e) => e.stopPropagation()}>
						{useIsCusPlanEditor() ? (
							<CustomerPlanEditorBar />
						) : (
							<SaveChangesBar />
						)}
					</div>
				</div>
				<SheetOverlay />
			</motion.div>

			<ProductSheets />
		</div>
	);
};
