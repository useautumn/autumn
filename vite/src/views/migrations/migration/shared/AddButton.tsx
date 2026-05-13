import { PlusIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export const DASHED_BUTTON_CLASS =
	"flex items-center gap-2 w-full h-8 px-3 rounded-xl bg-transparent border border-dashed border-border/50 text-t4 text-sm cursor-pointer outline-none hover:border-border hover:text-t2 active:border-border focus-visible:bg-muted/50 transition-colors";

export function AddButton({
	label,
	onClick,
	className,
}: {
	label: string;
	onClick: () => void;
	className?: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(DASHED_BUTTON_CLASS, className)}
		>
			<PlusIcon size={10} />
			{label}
		</button>
	);
}
