import { TABLE_TRAY_SURFACE_DIVIDER_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";

/** One label and its value inside a section, with a fixed label column. */
export const AtomFieldRow = ({
	label,
	isMuted = false,
	children,
}: {
	label: string;
	isMuted?: boolean;
	children: React.ReactNode;
}) => (
	<div
		className={cn(
			TABLE_TRAY_SURFACE_DIVIDER_CLASS,
			"flex min-h-11 items-center gap-4 px-4 py-2 text-sm",
		)}
	>
		<span
			className={cn(
				"w-36 shrink-0 font-medium text-foreground",
				isMuted && "font-normal text-tertiary-foreground",
			)}
		>
			{label}
		</span>
		<div className="flex min-w-0 flex-1 items-center gap-2 text-foreground">
			{children}
		</div>
	</div>
);
