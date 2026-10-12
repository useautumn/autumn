import { cn } from "@/lib/utils";
import { rateChangeParts } from "../../utils/rateCardRows";

/** A rate, with the rate it replaced struck through; `stacked` puts the old rate underneath for narrow rows. */
export function RateValue({
	rate,
	previousRate,
	muted = false,
	stacked = false,
}: {
	rate: string;
	previousRate?: string;
	muted?: boolean;
	stacked?: boolean;
}) {
	const parts = previousRate
		? rateChangeParts({ from: previousRate, to: rate })
		: null;

	return (
		<span
			className={cn(
				"flex shrink-0 whitespace-nowrap",
				stacked
					? "flex-col-reverse items-end leading-tight"
					: "items-baseline gap-1.5",
			)}
		>
			{parts && (
				<span className="text-subtle text-xs line-through">
					was {parts.from}
				</span>
			)}
			<span
				className={cn(
					"text-sm",
					muted ? "text-tertiary-foreground" : "font-medium text-foreground",
				)}
			>
				{rate}
			</span>
		</span>
	);
}
