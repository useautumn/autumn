import { Skeleton } from "@autumn/ui";
import { cn } from "@/lib/utils";
import type { SkeletonScope } from "../../utils/review/formPhasesToSkeletonPhases";
import {
	PRICING_TABLE_QTY_CLASS,
	PRICING_TABLE_ROW_CLASS,
	PRICING_TABLE_TOTAL_CLASS,
	PricingTablePhase,
} from "./ReviewPricingTable";

const PRODUCT_WIDTHS = ["w-24", "w-20", "w-28"];
const PRICE_LINE_WIDTHS = ["w-36", "w-44", "w-32"];
const TOTAL_WIDTHS = ["w-24", "w-20", "w-28"];

const pickWidth = ({ widths, index }: { widths: string[]; index: number }) =>
	widths[index % widths.length];

function SkeletonPricingRow({ index }: { index: number }) {
	return (
		<div className={PRICING_TABLE_ROW_CLASS}>
			<div className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
				<Skeleton
					className={cn(
						"h-3.5 rounded-sm",
						pickWidth({ widths: PRODUCT_WIDTHS, index }),
					)}
				/>
				<Skeleton
					className={cn(
						"h-3 rounded-sm",
						pickWidth({ widths: PRICE_LINE_WIDTHS, index }),
					)}
				/>
			</div>
			<span className={cn(PRICING_TABLE_QTY_CLASS, "flex justify-end")}>
				<Skeleton className="h-3.5 w-3 rounded-sm" />
			</span>
			<span className={cn(PRICING_TABLE_TOTAL_CLASS, "flex justify-end")}>
				<Skeleton
					className={cn(
						"h-3.5 rounded-sm",
						pickWidth({ widths: TOTAL_WIDTHS, index }),
					)}
				/>
			</span>
		</div>
	);
}

/** Pricing tables shaped like the form's phases, one row per chosen plan, held while a preview loads. */
export function ReviewPricingTableSkeleton({
	phases,
}: {
	phases: SkeletonScope[][];
}) {
	return (
		<div className="flex flex-col gap-5">
			{phases.map((scopes, phaseIndex) => {
				const rowCount = scopes.reduce(
					(total, scope) => total + scope.rowCount,
					0,
				);
				return (
					<PricingTablePhase
						key={phaseIndex}
						title={
							<>
								<Skeleton className="h-4 w-44 rounded-sm" />
								<Skeleton className="h-5 w-16 rounded" />
							</>
						}
					>
						{Array.from({ length: rowCount }, (_, rowIndex) => (
							<SkeletonPricingRow
								key={rowIndex}
								index={phaseIndex + rowIndex}
							/>
						))}
					</PricingTablePhase>
				);
			})}
		</div>
	);
}
