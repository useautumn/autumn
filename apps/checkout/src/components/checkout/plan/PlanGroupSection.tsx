import type { ApiFreeTrialV2, PreviewLineItem } from "@autumn/shared";
import { format, isToday } from "date-fns";
import { motion } from "motion/react";
import { FAST_TRANSITION } from "@/lib/animations";
import { formatAmount, formatPeriodRange } from "@/utils/formatUtils";
import { formatTrialDuration } from "@/utils/trialUtils";

type PlanChangeType = "incoming" | "outgoing";

function LineItemAmount({ item, currency }: { item: PreviewLineItem; currency: string }) {
	const hasDiscount = item.subtotal !== item.total;
	const originalAmount = item.subtotal;

	return (
		<motion.div
			key={item.total}
			className="flex items-center gap-1.5 shrink-0"
			initial={{ opacity: 0.5 }}
			animate={{ opacity: 1 }}
			transition={FAST_TRANSITION}
		>
			{hasDiscount && (
				<span className="text-sm tabular-nums text-muted-foreground/60 line-through">
					{formatAmount(originalAmount, currency)}
				</span>
			)}
			<span className="text-sm tabular-nums text-foreground">
				{formatAmount(item.total, currency)}
			</span>
		</motion.div>
	);
}

interface PlanGroupSectionProps {
	planName: string;
	items: PreviewLineItem[];
	currency: string;
	type: PlanChangeType;
	/** For outgoing plans: when the plan ends/is cancelled (ms timestamp) */
	cancelledAt?: number;
	/** Whether the incoming plan has an active free trial */
	hasActiveTrial?: boolean;
	/** Free trial config (for displaying duration in header) */
	freeTrial?: ApiFreeTrialV2 | null;
	/** Next cycle line items to display for trial plans (shows what will be charged after trial) */
	nextCycleItems?: PreviewLineItem[];
}

export function PlanGroupSection({
	planName,
	items,
	currency,
	type,
	cancelledAt,
	hasActiveTrial,
	freeTrial,
	nextCycleItems,
}: PlanGroupSectionProps) {
	// Sort items so base price appears first
	const sortedItems = [...items].sort((a, b) => {
		if (!a.feature_id && b.feature_id) return -1;
		if (a.feature_id && !b.feature_id) return 1;
		return 0;
	});

	// Format line item label with quantity
	const formatItemTitle = (item: PreviewLineItem): string => {
		if (!item.feature_id) return "Base price";
		const title = item.display_name;
		if (item.quantity > 1) {
			return `${title} x${item.quantity}`;
		}
		return title;
	};

	// Check if all items share the same period
	const itemsWithPeriod = sortedItems.filter((item) => item.period);
	const allSamePeriod =
		itemsWithPeriod.length > 0 &&
		itemsWithPeriod.every(
			(item) =>
				item.period?.start === itemsWithPeriod[0].period?.start &&
				item.period?.end === itemsWithPeriod[0].period?.end,
		);
	const sharedPeriod = allSamePeriod ? itemsWithPeriod[0].period : null;

	const headerRightText = (() => {
		if (type === "outgoing" && cancelledAt) {
			return isToday(new Date(cancelledAt))
				? "Cancelling today"
				: `Cancelling on ${format(new Date(cancelledAt), "do MMMM yyyy")}`;
		}
		if (hasActiveTrial && freeTrial) {
			const duration = formatTrialDuration({
				duration_type: freeTrial.duration_type,
				duration_length: freeTrial.duration_length,
			});
			return `${duration} free trial`;
		}
		if (sharedPeriod) {
			return formatPeriodRange(sharedPeriod.start, sharedPeriod.end);
		}
		return null;
	})();

	return (
		<div className="flex flex-col gap-1">
			{/* Plan name as section label with optional period or cancellation date */}
			<div className="flex items-center justify-between gap-2">
				<span className="text-sm font-medium text-foreground">{planName}</span>
				{headerRightText && (
					<span className="text-xs text-muted-foreground/60">
						{headerRightText}
					</span>
				)}
			</div>

			{/* Line items */}
			<div className="flex flex-col">
			{sortedItems.length === 0 && hasActiveTrial && nextCycleItems && nextCycleItems.length > 0 ? (
				// Show next cycle line items for trial plans (what they'll pay after trial)
				[...nextCycleItems]
					.sort((a, b) => {
						if (!a.feature_id && b.feature_id) return -1;
						if (a.feature_id && !b.feature_id) return 1;
						return 0;
					})
					.map((item, itemIndex) => (
						<div
							key={`next-${item.display_name}-${itemIndex}`}
							className="flex items-center justify-between py-0.5"
						>
							<span className="text-sm text-muted-foreground truncate">
								{formatItemTitle(item)}
							</span>
							<span className="text-sm tabular-nums text-foreground">
								{formatAmount(item.total, currency)}
							</span>
						</div>
					))
			) : sortedItems.length === 0 ? (
				<div className="flex items-center justify-between py-0.5">
					<span className="text-sm text-muted-foreground">
						{type === "outgoing" ? "No charges" : "Free"}
					</span>
					<span className="text-sm tabular-nums text-foreground">
						{formatAmount(0, currency)}
					</span>
				</div>
				) : (
					sortedItems.map((item, itemIndex) => (
						<div
							key={`${item.display_name}-${itemIndex}`}
							className="flex flex-col"
						>
							<div className="flex items-center justify-between py-0.5">
								<div className="flex items-center gap-2 min-w-0">
									<motion.span
										key={`${item.display_name}-${item.quantity}`}
										className="text-sm text-muted-foreground truncate"
										initial={{ opacity: 0.5 }}
										animate={{ opacity: 1 }}
										transition={FAST_TRANSITION}
									>
										{formatItemTitle(item)}
									</motion.span>
								</div>
								<LineItemAmount item={item} currency={currency} />
							</div>
							{/* Only show per-item period if items don't share the same period */}
							{!sharedPeriod && item.period && (
								<span className="text-xs text-muted-foreground/60 pl-0">
									{formatPeriodRange(item.period.start, item.period.end)}
								</span>
							)}
						</div>
					))
				)}
			</div>
		</div>
	);
}
