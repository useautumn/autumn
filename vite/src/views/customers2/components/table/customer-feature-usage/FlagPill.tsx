import { cn } from "@/lib/utils";

const BASE =
	"text-sm h-10 flex items-center px-4 rounded-lg border whitespace-nowrap";

export const FLAG_PILL_GAP = 8;

export const OVERFLOW_PILL_CLASSNAME = cn(
	BASE,
	"border-dashed text-tertiary-foreground w-28 justify-center",
);

export function flagPillClassName(granted: boolean) {
	return cn(
		BASE,
		granted
			? "text-muted-foreground bg-interactive-secondary"
			: "text-tertiary-foreground border-dashed",
	);
}
