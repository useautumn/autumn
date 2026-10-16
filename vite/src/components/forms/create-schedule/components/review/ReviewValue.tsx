import type { SetPlansReviewValue } from "@autumn/shared";
import { cn } from "@/lib/utils";

/** An amount with its suffix; a billing basis such as "Varies with usage" reads muted. */
export function ReviewValue({ value }: { value: SetPlansReviewValue }) {
	return (
		<>
			<span
				className={cn(
					"text-sm tabular-nums",
					value.is_basis
						? "text-tertiary-foreground"
						: "font-medium text-foreground",
				)}
			>
				{value.amount}
			</span>
			{value.suffix && (
				<span className="text-xs text-tertiary-foreground">{value.suffix}</span>
			)}
		</>
	);
}
