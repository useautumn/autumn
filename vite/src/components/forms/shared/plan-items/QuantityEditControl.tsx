import {
	IconButton,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@autumn/ui";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { type ReactNode, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Quantity display whose pencil opens the editable field in a popover, so the
 * stepper never has to share a row with the item label.
 */
export function QuantityEditControl({
	readOnly,
	displayText,
	showRing = false,
	isEditing,
	onEditingChange,
	title,
	hint,
	children,
}: {
	readOnly: boolean;
	displayText: string | undefined;
	showRing?: boolean;
	isEditing: boolean;
	onEditingChange: (editing: boolean) => void;
	/** Heading inside the popover, e.g. the feature or license name. */
	title?: string;
	/** Helper line under the stepper, e.g. the billing-unit step. */
	hint?: string;
	children: ReactNode;
}) {
	const contentRef = useRef<HTMLDivElement>(null);

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
		<div
			className={cn(
				"flex items-center py-1 w-fit shrink-0 gap-2 rounded-md",
				showRing && "ring-1 ring-inset ring-amber-500/50",
			)}
		>
			{displayText !== undefined && (
				<span className="text-sm tabular-nums text-tertiary-foreground">
					{displayText}
				</span>
			)}
			<Popover onOpenChange={onEditingChange} open={isEditing}>
				<PopoverTrigger asChild>
					<IconButton
						aria-label={title ? `Edit ${title} quantity` : "Edit quantity"}
						icon={<PencilSimpleIcon size={14} />}
						iconOrientation="center"
						size="sm"
						variant="secondary"
					/>
				</PopoverTrigger>
				<PopoverContent
					align="end"
					className="w-44 p-3"
					initialFocus={() => {
						const input = contentRef.current?.querySelector("input");
						if (!input) return true;
						input.focus();
						input.select();
						return input;
					}}
					ref={contentRef}
				>
					<div className="flex flex-col gap-2">
						{title && <p className="text-body-secondary">{title}</p>}
						{children}
						{hint && <p className="text-xs text-subtle">{hint}</p>}
					</div>
				</PopoverContent>
			</Popover>
		</div>
	);
}
