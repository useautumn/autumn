import { IconButton } from "@autumn/ui";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

export function InlinePrepaidQuantity({
	priceNote,
	quantityLabel,
	readOnly,
	children,
}: {
	priceNote: string;
	quantityLabel: string;
	readOnly: boolean;
	children: ReactNode;
}) {
	const [isEditing, setIsEditing] = useState(false);

	return (
		<div className="flex min-h-6 items-center gap-2">
			<p className="min-w-0 flex-1 truncate text-xs text-tertiary-foreground">
				{priceNote}
			</p>
			{isEditing ? (
				children
			) : (
				<span className="shrink-0 text-xs tabular-nums text-tertiary-foreground">
					{quantityLabel}
				</span>
			)}
			{!readOnly && (
				<IconButton
					aria-label={isEditing ? "Done editing quantity" : "Edit quantity"}
					aria-pressed={isEditing}
					className={cn(
						"size-6 shrink-0 text-tertiary-foreground hover:text-foreground",
						isEditing && "bg-interactive-secondary-hover text-foreground",
					)}
					icon={<PencilSimpleIcon />}
					onClick={() => setIsEditing((editing) => !editing)}
					size="sm"
					type="button"
					variant="secondary"
				/>
			)}
		</div>
	);
}
