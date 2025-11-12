import { AnimatePresence, motion } from "motion/react";
import { SheetContainer } from "@/components/v2/sheets/InlineSheet";
import { SheetCloseButton } from "@/components/v2/sheets/SheetCloseButton";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { AttachProductSheet } from "../components/sheets/AttachProductSheet";

const SHEET_ANIMATION = {
	duration: 0.5,
	ease: [0.32, 0.72, 0, 1] as const,
} as const;

export function CustomerSheets() {
	const sheetType = useSheetStore((s) => s.type);
	const closeSheet = useSheetStore((s) => s.closeSheet);

	const renderSheet = () => {
		switch (sheetType) {
			case "attach-product":
				return <AttachProductSheet />;
			default:
				return null;
		}
	};

	return (
		<AnimatePresence mode="wait">
			{sheetType && (
				<motion.div
					initial={{ width: 0 }}
					animate={{ width: "28rem" }}
					exit={{ width: 0 }}
					transition={SHEET_ANIMATION}
					className="h-full overflow-hidden"
				>
					<div className="w-[28rem] h-full">
						<SheetContainer className="w-full bg-card border-l shadow-sm h-full relative">
							<SheetCloseButton onClose={closeSheet} />
							{renderSheet()}
						</SheetContainer>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
