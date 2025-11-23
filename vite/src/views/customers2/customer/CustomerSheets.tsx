import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import { SheetContainer } from "@/components/v2/sheets/InlineSheet";
import { SheetCloseButton } from "@/components/v2/sheets/SheetCloseButton";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { AttachProductSheet } from "../components/sheets/AttachProductSheet";
import { SubscriptionDetailSheet } from "../components/sheets/SubscriptionDetailSheet";
import { SHEET_ANIMATION } from "./customerAnimations";

export function CustomerSheets() {
	const sheetType = useSheetStore((s) => s.type);
	const closeSheet = useSheetStore((s) => s.closeSheet);

	const renderSheet = () => {
		switch (sheetType) {
			case "attach-product":
				return <AttachProductSheet />;
			case "subscription-detail":
				return <SubscriptionDetailSheet />;
			default:
				return null;
		}
	};

	return createPortal(
		<AnimatePresence mode="wait">
			{sheetType && (
				<motion.div
					initial={{ x: "100%" }}
					animate={{ x: 0 }}
					exit={{ x: "100%" }}
					transition={SHEET_ANIMATION}
					className="fixed right-0 top-0 bottom-0"
					style={{ width: "28rem", zIndex: 100 }}
				>
					<SheetContainer className="w-full bg-background z-50 border-l h-full relative">
						<SheetCloseButton onClose={closeSheet} />
						{renderSheet()}
					</SheetContainer>
				</motion.div>
			)}
		</AnimatePresence>,
		document.body,
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
