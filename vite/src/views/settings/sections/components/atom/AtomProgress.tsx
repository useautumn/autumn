import { cn } from "@/lib/utils";

/** The bar over a step table, with what it is waiting on beneath. */
export const AtomProgress = ({
	label,
	percent,
	caption,
	isFailed = false,
}: {
	label: string;
	/** Null when alien reports no steps to count, so the bar only pulses. */
	percent: number | null;
	caption?: React.ReactNode;
	isFailed?: boolean;
}) => (
	<div className="flex flex-col gap-1.5 px-4 pt-3 pb-2.5">
		<div
			role="progressbar"
			aria-label={label}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={percent ?? undefined}
			className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
		>
			<div
				className={cn(
					"h-full rounded-full bg-primary transition-[width] duration-500 ease-out",
					isFailed && "bg-destructive",
					percent === null && "animate-pulse bg-primary/40",
				)}
				style={{ width: `${percent ?? 100}%` }}
			/>
		</div>
		{caption && (
			<div className="flex items-center justify-between gap-3 text-xs text-tertiary-foreground">
				{caption}
			</div>
		)}
	</div>
);
