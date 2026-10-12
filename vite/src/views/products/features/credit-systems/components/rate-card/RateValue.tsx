import { cn } from "@/lib/utils";
import { previousRateText } from "../../utils/rateCardRows";

/** A rate with the one it replaced struck through: "was 3" beside or under it, or "3 →" before it. */
export function RateValue({
	rate,
	previousRate,
	muted = false,
	layout = "inline",
	className,
}: {
	rate: string;
	previousRate?: string | null;
	muted?: boolean;
	layout?: "inline" | "stacked" | "arrow";
	className?: string;
}) {
	const from =
		previousRate && previousRateText({ from: previousRate, to: rate });

	return (
		<span
			className={cn(
				"flex shrink-0 whitespace-nowrap text-sm",
				layout === "stacked"
					? "flex-col-reverse items-end leading-tight"
					: "items-baseline gap-1.5",
				className,
			)}
		>
			{from && (
				<span className="text-subtle text-xs line-through">
					{layout === "arrow" ? from : `was ${from}`}
				</span>
			)}
			{from && layout === "arrow" && <span className="text-subtle">→</span>}
			<span
				className={cn(
					muted ? "text-tertiary-foreground" : "font-medium text-foreground",
				)}
			>
				{rate}
			</span>
		</span>
	);
}
