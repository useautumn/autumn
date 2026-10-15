import type { SetPlansReviewPhase, SetPlansReviewRow } from "@autumn/shared";
import type { ReactNode } from "react";
import {
	TABLE_TRAY_SURFACE_CLASS,
	TABLE_TRAY_SURFACE_DIVIDER_CLASS,
} from "@/components/general/table";
import { cn } from "@/lib/utils";
import { formatReviewText } from "../../utils/review/formatReviewText";
import { ReviewValue } from "./ReviewValue";

type ReviewPhaseBadge = NonNullable<SetPlansReviewPhase["badge"]>;

const NO_VALUE = "—";

const BADGE_COPY: Record<
	ReviewPhaseBadge,
	{ label: string; className: string }
> = {
	active: { label: "Active", className: "bg-emerald-500/15 text-emerald-400" },
	scheduled: {
		label: "Scheduled",
		className: "bg-zinc-500/15 text-tertiary-foreground",
	},
	canceled: { label: "Canceled", className: "bg-red-500/15 text-red-400" },
};

export const PRICING_TABLE_ROW_CLASS = cn(
	"flex items-center gap-3 px-3 py-2",
	TABLE_TRAY_SURFACE_DIVIDER_CLASS,
);
export const PRICING_TABLE_QTY_CLASS = "w-[60px] shrink-0 text-right";
export const PRICING_TABLE_TOTAL_CLASS = "w-[140px] shrink-0 text-right";

function PricingTablePhaseBadge({ badge }: { badge: ReviewPhaseBadge }) {
	const { label, className } = BADGE_COPY[badge];
	return (
		<span
			className={cn(
				"shrink-0 rounded px-1.5 text-xs font-medium leading-5",
				className,
			)}
		>
			{label}
		</span>
	);
}

/** The phase's dates and status above a card holding its Product / Qty / Total table. */
export function PricingTablePhase({
	title,
	children,
}: {
	title: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2">{title}</div>
			<div className={TABLE_TRAY_SURFACE_CLASS}>
				<div className="flex gap-3 border-b border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-tertiary-foreground">
					<span className="flex-1">Product</span>
					<span className={PRICING_TABLE_QTY_CLASS}>Qty</span>
					<span className={PRICING_TABLE_TOTAL_CLASS}>Total</span>
				</div>
				{children}
			</div>
		</div>
	);
}

function PricingTableRow({ row }: { row: SetPlansReviewRow }) {
	return (
		<div className={PRICING_TABLE_ROW_CLASS}>
			<div className="flex min-w-0 flex-1 flex-col">
				<span className="truncate text-sm font-medium text-foreground">
					{row.title}
				</span>
				{row.description && (
					<span className="truncate text-xs text-tertiary-foreground">
						{formatReviewText(row.description)}
					</span>
				)}
			</div>
			<span
				className={cn(
					PRICING_TABLE_QTY_CLASS,
					"text-sm tabular-nums",
					row.quantity ? "text-foreground" : "text-tertiary-foreground",
				)}
			>
				{row.quantity ?? NO_VALUE}
			</span>
			<span
				className={cn(PRICING_TABLE_TOTAL_CLASS, "flex justify-end gap-[3px]")}
			>
				{row.value ? (
					<ReviewValue value={row.value} />
				) : (
					<span className="text-sm text-tertiary-foreground">{NO_VALUE}</span>
				)}
			</span>
		</div>
	);
}

/** Each phase as a Stripe-style pricing table: what the subscription bills, not a diff. */
export function ReviewPricingTable({
	phases,
}: {
	phases: SetPlansReviewPhase[];
}) {
	return (
		<div className="flex flex-col gap-5">
			{phases.map((phase) => (
				<PricingTablePhase
					key={phase.key}
					title={
						<>
							<span className="text-[13px] font-semibold text-foreground">
								{formatReviewText(phase.range ?? phase.label)}
							</span>
							{phase.badge && <PricingTablePhaseBadge badge={phase.badge} />}
						</>
					}
				>
					{phase.rows.map((row) => (
						<PricingTableRow key={row.key} row={row} />
					))}
				</PricingTablePhase>
			))}
		</div>
	);
}
