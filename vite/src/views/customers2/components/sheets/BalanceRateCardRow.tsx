import type { Feature } from "@autumn/shared";
import { TABLE_TRAY_SURFACE_DIVIDER_CLASS } from "@/components/general/table";
import { cn } from "@/lib/utils";
import { RateStateBadge } from "@/views/products/features/credit-systems/components/rate-card/RateStateBadge";
import { RateValue } from "@/views/products/features/credit-systems/components/rate-card/RateValue";
import { featureDisplayName } from "@/views/products/features/credit-systems/utils/featureDisplayName";
import {
	type RateCardRow,
	rowRateLabels,
} from "@/views/products/features/credit-systems/utils/rateCardRows";

/** A rate card row on the balance sheet, labelled with where its rate is set. */
export function BalanceRateCardRow({
	row,
	features,
	source,
}: {
	row: RateCardRow;
	features: Feature[];
	source: string;
}) {
	const setOnPlan = row.state === "changed" || row.state === "added";

	return (
		<li
			className={cn(
				TABLE_TRAY_SURFACE_DIVIDER_CLASS,
				"flex h-12 items-center justify-between gap-3 px-3",
			)}
		>
			<div className="flex min-w-0 flex-col gap-0.5">
				<span
					className={cn(
						"truncate text-sm",
						row.state === "excluded"
							? "text-tertiary-foreground"
							: "font-medium text-foreground",
					)}
				>
					{featureDisplayName({ features, featureId: row.featureId })}
				</span>
				<span
					className={cn(
						"flex items-center gap-1.5 text-xs",
						setOnPlan
							? "font-medium text-foreground"
							: "text-tertiary-foreground",
					)}
				>
					<span
						className={cn(
							"size-1.5 shrink-0 rounded-full",
							setOnPlan ? "bg-foreground" : "bg-subtle",
						)}
					/>
					{source}
				</span>
			</div>
			{row.state === "excluded" ? (
				<RateStateBadge label="Not covered" muted />
			) : (
				<RateValue
					{...rowRateLabels({ row, features })}
					muted={row.state === "inherited"}
				/>
			)}
		</li>
	);
}
