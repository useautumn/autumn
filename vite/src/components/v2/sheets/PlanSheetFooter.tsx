import { ShortcutButton } from "@autumn/ui";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { LAYOUT_TRANSITION } from "./SharedSheetComponents";

interface PlanSheetFooterProps {
	isDirty: boolean;
	onDiscard: () => void;
	onClose: () => void;
	onConfirm: () => void;
	confirmLabel: string;
	closeLabel?: string;
	discardLabel?: string;
	confirmDisabled?: boolean;
	isLoading?: boolean;
	className?: string;
}

export function PlanSheetFooter({
	isDirty,
	onDiscard,
	onClose,
	onConfirm,
	confirmLabel,
	closeLabel = "Close",
	discardLabel = "Discard",
	confirmDisabled = false,
	isLoading = false,
	className,
}: PlanSheetFooterProps) {
	const handleLeftAction = () => {
		if (isDirty) {
			onDiscard();
			return;
		}
		onClose();
	};

	return (
		<motion.div
			layout
			transition={{ layout: LAYOUT_TRANSITION }}
			className={cn(
				"shrink-0 pt-2 px-4 pb-4 w-full grid grid-cols-2 gap-2 border-t border-border/40",
				className,
			)}
		>
			<ShortcutButton
				variant="secondary"
				className="w-full"
				onClick={handleLeftAction}
				singleShortcut={isDirty ? undefined : "escape"}
			>
				{isDirty ? discardLabel : closeLabel}
			</ShortcutButton>
			<ShortcutButton
				className="w-full"
				onClick={onConfirm}
				metaShortcut="enter"
				disabled={confirmDisabled}
				isLoading={isLoading}
			>
				{confirmLabel}
			</ShortcutButton>
		</motion.div>
	);
}
