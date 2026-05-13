import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const ACTION_CARD_CLASS =
	"flex items-center gap-3 min-h-16 py-3 px-4 rounded-xl bg-transparent border border-dashed border-border/50 text-left cursor-pointer outline-none hover:border-border hover:bg-muted/40 active:bg-muted/60 focus-visible:bg-muted/50 transition-colors";

export function ActionCard({
	icon,
	heading,
	subheading,
	onClick,
	className,
}: {
	icon: ReactNode;
	heading: string;
	subheading: string;
	onClick: () => void;
	className?: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(ACTION_CARD_CLASS, className)}
		>
			{icon}
			<div className="flex flex-col gap-0.5">
				<span className="text-sm font-medium text-t1">{heading}</span>
				<span className="text-xs text-t3">{subheading}</span>
			</div>
		</button>
	);
}
