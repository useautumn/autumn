import { IconButton } from "@autumn/ui";
import { CheckIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { FAST_TRANSITION } from "@/components/forms/update-subscription-v2/constants/animationConstants";
import { cn } from "@/lib/utils";

/**
 * Inline quantity display that expands into an editable field.
 * Children render the form-bound quantity input shown while editing.
 */
export function QuantityEditControl({
	readOnly,
	displayText,
	showRing = false,
	isEditing,
	onEditingChange,
	children,
}: {
	readOnly: boolean;
	displayText: string | undefined;
	showRing?: boolean;
	isEditing: boolean;
	onEditingChange: (editing: boolean) => void;
	children: ReactNode;
}) {
	if (readOnly) {
		return (
			<div className="flex items-center py-1 w-fit shrink-0">
				<span className="text-sm tabular-nums text-tertiary-foreground">
					{displayText ?? "—"}
				</span>
			</div>
		);
	}

	return (
		<motion.div
			layout
			transition={FAST_TRANSITION}
			className={cn(
				"flex items-center py-1 w-fit shrink-0 gap-2 overflow-hidden",
				showRing && "ring-1 ring-inset ring-amber-500/50",
			)}
		>
			<AnimatePresence mode="popLayout" initial={false}>
				{isEditing ? (
					<motion.div
						key="edit"
						layout
						initial={{ opacity: 0, x: 10 }}
						animate={{ opacity: 1, x: 0 }}
						exit={{ opacity: 0, x: -10 }}
						transition={FAST_TRANSITION}
						className="flex items-center gap-2"
					>
						{children}
						<IconButton
							icon={<CheckIcon size={14} />}
							variant="skeleton"
							size="sm"
							className="text-green-600 dark:text-green-500 hover:text-green-700! dark:hover:text-green-400! hover:bg-black/5 dark:hover:bg-white/10"
							onClick={() => onEditingChange(false)}
						/>
					</motion.div>
				) : (
					<motion.div
						key="display"
						layout
						initial={{ opacity: 0, x: -10 }}
						animate={{ opacity: 1, x: 0 }}
						exit={{ opacity: 0, x: 10 }}
						transition={FAST_TRANSITION}
						className="flex items-center gap-2"
					>
						{displayText !== undefined && (
							<span className="text-sm tabular-nums text-tertiary-foreground">
								{displayText}
							</span>
						)}
						<IconButton
							icon={<PencilSimpleIcon size={14} />}
							variant="secondary"
							size="sm"
							iconOrientation="center"
							onClick={() => onEditingChange(true)}
						/>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);
}
