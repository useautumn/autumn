import { cn } from "@/lib/utils";

const BASE =
	"text-sm h-10 flex items-center px-4 rounded-lg border whitespace-nowrap";

export const FLAG_PILL_GAP = 8;

// Fixed width so swapping "+7 more" for "Show less" doesn't resize the pill,
// which reads as drift while it fades.
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
