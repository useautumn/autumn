import type { InvoiceTemplate } from "@autumn/shared";
import { TrashIcon } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { Button } from "@/components/v2/buttons/Button";

export function InvoiceTemplateRow({
	template,
	onEdit,
	onDelete,
	isDeleting,
}: {
	template: InvoiceTemplate;
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
			className="flex items-center gap-2 rounded-lg border bg-interactive-secondary px-3 py-2 min-w-0"
		>
			<button
				type="button"
				className="flex flex-col gap-0.5 min-w-0 flex-1 text-left cursor-pointer"
				onClick={onEdit}
			>
				<span className="truncate text-sm font-medium">{template.name}</span>
				<span className="truncate text-xs text-tertiary-foreground">
					{template.footer ?? template.memo}
				</span>
			</button>
			<Button
				variant="muted"
				size="mini"
				className="text-destructive hover:text-destructive shrink-0"
				onClick={onDelete}
				disabled={isDeleting}
			>
				<TrashIcon className="size-3.5" />
			</Button>
		</motion.div>
	);
}
