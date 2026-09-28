import {
	IconButton,
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@autumn/ui";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { type ReactNode, useRef } from "react";
import { cn } from "@/lib/utils";

export type QuantityTrigger = "button" | "chip";

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
	trigger = "button",
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
	/** "chip" folds the quantity and pencil into one clickable chip. */
	trigger?: QuantityTrigger;
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

	const ariaLabel = title ? `Edit ${title} quantity` : "Edit quantity";

	return (
		<div
			className={cn(
				"flex items-center py-1 w-fit shrink-0 gap-2 rounded-md",
				showRing && "ring-1 ring-inset ring-amber-500/50",
			)}
		>
			{trigger === "button" && displayText !== undefined && (
				<span className="text-sm tabular-nums text-tertiary-foreground">
					{displayText}
				</span>
			)}
			<Popover onOpenChange={onEditingChange} open={isEditing}>
				<PopoverTrigger asChild>
					{trigger === "chip" ? (
						<button
							aria-label={ariaLabel}
							className="flex h-6 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 text-xs font-medium tabular-nums text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 data-popup-open:bg-muted"
							type="button"
						>
							{displayText}
							<PencilSimpleIcon
								className="shrink-0 text-tertiary-foreground"
								size={12}
							/>
						</button>
					) : (
						<IconButton
							aria-label={ariaLabel}
							icon={<PencilSimpleIcon size={14} />}
							iconOrientation="center"
							size="sm"
							variant="secondary"
						/>
					)}
				</PopoverTrigger>
				<PopoverContent
					align={trigger === "chip" ? "start" : "end"}
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
