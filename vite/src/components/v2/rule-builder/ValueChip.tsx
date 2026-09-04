import { XIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

interface ValueChipProps {
	label: string;
	icon?: ReactNode;
	onRemove: () => void;
}

export function ValueChip({ label, icon, onRemove }: ValueChipProps) {
	return (
		<span className="flex items-center gap-0.5 bg-accent border border-border text-foreground rounded px-1 h-4.5 text-[10px] shrink-0 max-w-48">
			{icon && <span className="shrink-0 [&_svg]:size-3">{icon}</span>}
			<span className="truncate">{label}</span>
			<button
				type="button"
				aria-label={`Remove ${label}`}
				className="cursor-pointer text-tertiary-foreground hover:text-destructive ml-0.5"
				onClick={(e) => {
					e.stopPropagation();
					onRemove();
				}}
				onPointerDown={(e) => e.stopPropagation()}
			>
				<XIcon size={10} />
			</button>
		</span>
	);
}
