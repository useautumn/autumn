import { XIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

interface ValueChipProps {
	label: string;
	icon?: ReactNode;
	onRemove: () => void;
	/** False inside a button (a picker trigger), where nesting one is invalid HTML. */
	interactive?: boolean;
}

export function ValueChip({
	label,
	icon,
	onRemove,
	interactive = true,
}: ValueChipProps) {
	const removeProps = {
		className:
			"cursor-pointer text-tertiary-foreground hover:text-destructive ml-0.5",
		onClick: (event: React.MouseEvent) => {
			event.stopPropagation();
			onRemove();
		},
		onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
	};

	return (
		<span className="flex items-center gap-0.5 bg-accent border border-border text-foreground rounded px-1 h-4.5 text-[10px] shrink-0 max-w-48">
			{icon && <span className="shrink-0 [&_svg]:size-3">{icon}</span>}
			<span className="truncate">{label}</span>
			{interactive ? (
				<button type="button" aria-label={`Remove ${label}`} {...removeProps}>
					<XIcon size={10} />
				</button>
			) : (
				<span {...removeProps}>
					<XIcon size={10} />
				</span>
			)}
		</span>
	);
}
