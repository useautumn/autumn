import type { ReactNode } from "react";
import { cn } from "../../lib/format.ts";

export type TintTone = "idle" | "info" | "ok" | "bad" | "warn";

const TINT: Record<TintTone, string> = {
	idle: "border-border bg-muted text-tertiary-foreground",
	info: "border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-400",
	ok: "border-green-200 bg-green-50 text-green-600 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-400",
	bad: "border-red-200 bg-red-50 text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400",
	warn: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-400",
};

/** The runs-list pill: tinted fill with a matching hairline border, as in the Paper frames. */
export const TintPill = ({
	tone,
	children,
	className,
}: {
	tone: TintTone;
	children: ReactNode;
	className?: string;
}) => (
	<span
		className={cn(
			"inline-flex h-5 shrink-0 items-center gap-1 rounded-[5px] border px-[7px] text-xs font-medium whitespace-nowrap tabular-nums",
			TINT[tone],
			className,
		)}
	>
		{children}
	</span>
);
