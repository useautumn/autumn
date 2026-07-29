import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";

const SHEET_BACKDROP_Z_INDEX = 40;

interface SheetBackdropProps {
	isOpen: boolean;
	onClose: () => void;
	zIndex?: number;
}

/**
 * Full-viewport dimming backdrop for inline sheets, portaled to the document body
 * so it covers everything behind the floating sheet panel uniformly.
 */
export function SheetBackdrop({
	isOpen,
	onClose,
	zIndex = SHEET_BACKDROP_Z_INDEX,
}: SheetBackdropProps) {
	return createPortal(
		<AnimatePresence>
			{isOpen && (
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					className="fixed inset-0 bg-white/70 dark:bg-black/70"
					style={{ zIndex }}
					onMouseDown={onClose}
				/>
			)}
		</AnimatePresence>,
		document.body,
	);
}
