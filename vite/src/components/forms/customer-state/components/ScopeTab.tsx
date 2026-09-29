import { cn } from "@/lib/utils";

export const SCOPE_TAB_CLASS =
	"flex h-5.5 shrink-0 cursor-pointer items-center rounded-sm border text-[11.5px] font-medium transition-colors";

export function ScopeTab({
	label,
	isActive,
	onClick,
}: {
	label: string;
	isActive: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				SCOPE_TAB_CLASS,
				"min-w-0 px-2",
				isActive
					? "border-foreground/15 bg-foreground/10 text-foreground"
					: "border-foreground/10 bg-transparent text-tertiary-foreground hover:text-foreground",
			)}
		>
			<span className="max-w-24 truncate">{label}</span>
		</button>
	);
}
