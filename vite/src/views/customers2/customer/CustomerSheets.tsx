import { AnimatePresence, motion } from "motion/react";
import { SheetContainer } from "@/components/v2/sheets/InlineSheet";
import { SheetCloseButton } from "@/components/v2/sheets/SheetCloseButton";
import { useCustomerBalanceSheetStore } from "@/hooks/stores/useCustomerBalanceSheetStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { AttachProductSheet } from "../components/sheets/AttachProductSheet";
import { BalanceEditSheet } from "../components/sheets/BalanceEditSheet";
import { BalanceSelectionSheet } from "../components/sheets/BalanceSelectionSheet";
import { SubscriptionDetailSheet } from "../components/sheets/SubscriptionDetailSheet";
import { SubscriptionUpdateSheet } from "../components/sheets/SubscriptionUpdateSheet";
import { SHEET_ANIMATION } from "./customerAnimations";

export function CustomerSheets() {
	const sheetType = useSheetStore((s) => s.type);
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const closeBalanceSheet = useCustomerBalanceSheetStore((s) => s.closeSheet);

	const handleClose = () => {
		closeSheet();
		closeBalanceSheet();
	};

	const renderSheet = () => {
		switch (sheetType) {
			case "attach-product":
				return <AttachProductSheet />;
			case "subscription-detail":
				return <SubscriptionDetailSheet />;
			case "subscription-update":
				return <SubscriptionUpdateSheet />;
			case "balance-selection":
				return <BalanceSelectionSheet />;
			case "balance-edit":
				return <BalanceEditSheet />;
			default:
				return null;
		}
	};

	return (
		<AnimatePresence mode="wait">
			{sheetType && (
				<motion.div
					initial={{ x: "100%" }}
					animate={{ x: 0 }}
					exit={{ x: "100%" }}
					transition={SHEET_ANIMATION}
					className="absolute right-0 top-0 bottom-0"
					style={{ width: "28rem", zIndex: 100 }}
				>
					<SheetContainer className="w-full bg-background z-50 border-l dark:border-l-0 h-full relative">
						<SheetCloseButton onClose={handleClose} />
						{renderSheet()}
					</SheetContainer>
				</motion.div>
			)}
		</AnimatePresence>
	);

	// return (
	// 	<Sheet open={open} onOpenChange={closeSheet}>
	// 		<SheetContent
	// 			className="w-full bg-background border-l h-full"
	// 			// side="right"
	// 		>
	// 			{renderSheet()}
	// 		</SheetContent>
	// 	</Sheet>
	// );
}
