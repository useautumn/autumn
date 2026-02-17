import type { ApiFreeTrialV2, PreviewLineItem } from "@autumn/shared";
import { format, isToday } from "date-fns";
import { motion } from "motion/react";
import { FAST_TRANSITION } from "@/lib/animations";
import { formatAmount, formatPeriodRange } from "@/utils/formatUtils";
import { formatTrialDuration } from "@/utils/trialUtils";

type PlanChangeType = "incoming" | "outgoing";

function LineItemAmount({ item, currency }: { item: PreviewLineItem; currency: string }) {
	const totalDiscount = item.discounts.reduce((sum, d) => sum + d.amountOff, 0);
	const hasDiscount = totalDiscount > 0;
	const originalAmount = item.amount + totalDiscount;

	return (
		<motion.div
			key={item.amount}
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
				{formatAmount(item.amount, currency)}
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
		if (a.is_base && !b.is_base) return -1;
		if (!a.is_base && b.is_base) return 1;
		return 0;
	});

	// Format line item title with quantity
	const formatItemTitle = (item: PreviewLineItem): string => {
		if (item.is_base) return "Base price";
		const title = item.title;
		if (!item.is_base && item.total_quantity > 1) {
			return `${title} x${item.total_quantity}`;
		}
		return title;
	};

	// Check if all items share the same effective period
	const itemsWithPeriod = sortedItems.filter((item) => item.effective_period);
	const allSamePeriod =
		itemsWithPeriod.length > 0 &&
		itemsWithPeriod.every(
			(item) =>
				item.effective_period?.start === itemsWithPeriod[0].effective_period?.start &&
				item.effective_period?.end === itemsWithPeriod[0].effective_period?.end,
		);
	const sharedPeriod = allSamePeriod ? itemsWithPeriod[0].effective_period : null;

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
						if (a.is_base && !b.is_base) return -1;
						if (!a.is_base && b.is_base) return 1;
						return 0;
					})
					.map((item, itemIndex) => (
						<div key={`next-${item.title}-${itemIndex}`} className="flex items-center justify-between py-0.5">
							<span className="text-sm text-muted-foreground truncate">
								{formatItemTitle(item)}
							</span>
							<span className="text-sm tabular-nums text-foreground">
								{formatAmount(item.amount, currency)}
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
						<div key={`${item.title}-${itemIndex}`} className="flex flex-col">
							<div className="flex items-center justify-between py-0.5">
								<div className="flex items-center gap-2 min-w-0">
									<motion.span
										key={`${item.title}-${item.total_quantity}`}
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
							{!sharedPeriod && item.effective_period && (
								<span className="text-xs text-muted-foreground/60 pl-0">
									{formatPeriodRange(item.effective_period.start, item.effective_period.end)}
								</span>
							)}
						</div>
					))
				)}
			</div>
		</div>
	);
}
