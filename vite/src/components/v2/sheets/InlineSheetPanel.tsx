import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { SheetContainer } from "@/components/v2/sheets/InlineSheet";
import { SheetCloseButton } from "@/components/v2/sheets/SheetCloseButton";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";

const SHEET_PANEL_WIDTH = "28rem";
const SHEET_PANEL_Z_INDEX = 100;
const SHEET_PANEL_TRANSITION = {
	duration: 0.3,
	ease: [0.32, 0.72, 0, 1] as const,
} as const;

interface InlineSheetPanelProps {
	isOpen: boolean;
	onClose: () => void;
	children: ReactNode;
	className?: string;
	width?: string;
	zIndex?: number;
	transition?: {
		duration: number;
		ease: readonly [number, number, number, number];
	};
}

/**
 * Shared right-hand sheet panel used across the app's inline sheet orchestrators.
 * Renders a slide-in, rounded, inset panel that floats over the (separately
 * rendered) backdrop so the surrounding area reads as dimmed on every side.
 */
export function InlineSheetPanel({
	isOpen,
	onClose,
	children,
	className,
	width = SHEET_PANEL_WIDTH,
	zIndex = SHEET_PANEL_Z_INDEX,
	transition = SHEET_PANEL_TRANSITION,
}: InlineSheetPanelProps) {
	const isMobile = useIsMobile();
	return (
		<AnimatePresence mode="wait">
			{isOpen && (
				<motion.div
					initial={{ x: "100%" }}
					animate={{ x: 0 }}
					exit={{ x: "100%" }}
					transition={transition}
					className={cn(
						"absolute right-0 top-0 bottom-0",
						isMobile ? "p-0" : "px-3 py-2",
					)}
					style={{ width: isMobile ? "100%" : width, zIndex }}
				>
					<SheetContainer
						className={cn(
							"w-full h-full bg-card relative",
							isMobile
								? "border-l border-border/40"
								: "rounded-2xl border border-border/40",
							className,
						)}
					>
						<SheetCloseButton onClose={onClose} />
						{children}
					</SheetContainer>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
