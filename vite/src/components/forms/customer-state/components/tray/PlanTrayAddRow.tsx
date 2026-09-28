import { PlusIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { TABLE_TRAY_SURFACE_ROW_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";

export function PlanTrayAddRow({
	label,
	disabled,
	scope,
	onClick,
}: {
	label: string;
	disabled?: boolean;
	/** Picker for the scope the new plan is added under. */
	scope?: ReactNode;
	onClick: () => void;
}) {
	return (
		<div
			className={cn(
				"flex h-9 w-full items-center gap-2 pr-2",
				TABLE_TRAY_SURFACE_ROW_CLASS,
			)}
		>
			<button
				type="button"
				onClick={onClick}
				disabled={disabled}
				className="flex h-full items-center gap-2 pl-3 text-sm text-tertiary-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
			>
				<PlusIcon size={12} />
				{label}
			</button>
			{scope && (
				<>
					<span className="text-xs text-subtle">for</span>
					{scope}
				</>
			)}
		</div>
	);
}
