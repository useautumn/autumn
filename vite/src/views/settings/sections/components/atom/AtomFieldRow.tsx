import { TABLE_TRAY_SURFACE_DIVIDER_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";

/** One label and its value inside a section, with a fixed label column; a tall value aligns its label to its first line. */
export const AtomFieldRow = ({
	label,
	isMuted = false,
	isTall = false,
	children,
}: {
	label: string;
	isMuted?: boolean;
	isTall?: boolean;
	children: React.ReactNode;
}) => (
	<div
		className={cn(
			TABLE_TRAY_SURFACE_DIVIDER_CLASS,
			"flex min-h-11 items-center gap-4 px-4 py-2 text-sm",
			isTall && "items-start py-3",
		)}
	>
		<span
			className={cn(
				"w-36 shrink-0 font-medium text-foreground",
				isMuted && "font-normal text-tertiary-foreground",
				isTall && "pt-2",
			)}
		>
			{label}
		</span>
		<div
			className={cn(
				"flex min-w-0 flex-1 items-center gap-2 text-foreground",
				isTall && "flex-col items-start gap-1.5",
			)}
		>
			{children}
		</div>
	</div>
);
