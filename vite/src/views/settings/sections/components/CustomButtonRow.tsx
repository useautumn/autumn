import type { CustomButton } from "@autumn/shared";
import {
	ArrowSquareOutIcon,
	PencilSimpleIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { motion } from "motion/react";
import { Button } from "@/components/v2/buttons/Button";

export function CustomButtonRow({
	button,
	onEdit,
	onDelete,
	isDeleting,
}: {
	button: CustomButton;
	onEdit: () => void;
	onDelete: () => void;
	isDeleting: boolean;
}) {
	return (
		<motion.div
			layout
			initial={{ opacity: 0, y: -4 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.15, ease: "easeOut" }}
			className="group flex items-center gap-2 rounded-lg border bg-interactive-secondary px-3 py-2 min-w-0 transition-colors hover:bg-interactive-secondary-hover"
		>
			<button
				type="button"
				className="flex flex-col gap-0.5 min-w-0 flex-1 text-left cursor-pointer"
				onClick={onEdit}
			>
				<span className="flex items-center gap-1.5 truncate text-sm font-medium">
					{button.label}
					{button.open_in_new_tab && (
						<ArrowSquareOutIcon className="size-3 shrink-0 text-tertiary-foreground" />
					)}
				</span>
				<span className="truncate text-xs text-tertiary-foreground">
					{button.url}
				</span>
			</button>
			<Button
				variant="muted"
				size="mini"
				className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
				onClick={onEdit}
			>
				<PencilSimpleIcon className="size-3.5" />
			</Button>
			<Button
				variant="muted"
				size="mini"
				className="text-destructive hover:text-destructive shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
				onClick={onDelete}
				disabled={isDeleting}
			>
				<TrashIcon className="size-3.5" />
			</Button>
		</motion.div>
	);
}
