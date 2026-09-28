import { PlusIcon } from "@phosphor-icons/react";
import { TABLE_TRAY_SURFACE_ROW_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";

export function PlanTrayAddRow({
	label,
	disabled,
	onClick,
}: {
	label: string;
	disabled?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={cn(
				"flex h-9 w-full items-center gap-2 px-3 text-sm text-tertiary-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
				TABLE_TRAY_SURFACE_ROW_CLASS,
			)}
		>
			<PlusIcon size={12} />
			{label}
		</button>
	);
}
