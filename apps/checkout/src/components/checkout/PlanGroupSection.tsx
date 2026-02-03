import type { PreviewLineItem } from "@autumn/shared";
import { Minus, Plus } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { Separator } from "@/components/ui/separator";
import { FAST_TRANSITION } from "@/lib/animations";
import { cn } from "@/lib/utils";
import { formatAmount, formatPeriodRange } from "@/utils/formatUtils";

type PlanChangeType = "incoming" | "outgoing";

interface PlanGroupSectionProps {
	planId: string;
	planName: string;
	items: PreviewLineItem[];
	currency: string;
	type: PlanChangeType;
}

export function PlanGroupSection({
	planId,
	planName,
	items,
	currency,
	type,
}: PlanGroupSectionProps) {
	const groupTotal = items.reduce((sum, item) => sum + item.amount, 0);

	// Sort items so base price appears first
	const sortedItems = [...items].sort((a, b) => {
		if (a.is_base && !b.is_base) return -1;
		if (!a.is_base && b.is_base) return 1;
		return 0;
	});

	// Extract group-level effective period from the first item with one
	// (typically all items in a group share the same billing period)
	const groupEffectivePeriod = items.find(
		(item) => item.effective_period,
	)?.effective_period;

	return (
		<div className="overflow-hidden">
			{/* Plan header */}
			<div className="px-3 py-2.5 border-b bg-background/50">
				<div className="flex items-center justify-between gap-4">
					<div className="flex items-center gap-2 min-w-0">
						<span className="text-sm text-foreground truncate">
							{planName}
						</span>
					</div>
					<span className="text-sm font-semibold tabular-nums text-foreground shrink-0">
						{formatAmount(groupTotal, currency)}
					</span>
				</div>
				{/* Group-level proration period */}
				{groupEffectivePeriod && (
					<p className="text-xs text-muted-foreground mt-0.5">
						{formatPeriodRange(groupEffectivePeriod.start, groupEffectivePeriod.end)}
					</p>
				)}
			</div>

			{/* Line items for this plan */}
			<div className="px-3">
				{sortedItems.length === 0 ? (
					<div className="flex items-center justify-between gap-4 py-2">
						<span className="text-xs text-muted-foreground">
							{type === "outgoing" ? "No charges" : "Free"}
						</span>
						<span className="text-xs tabular-nums text-muted-foreground shrink-0">
							{formatAmount(0, currency)}
						</span>
					</div>
				) : (
					sortedItems.map((item, itemIndex) => (
						<div key={`${item.title}-${itemIndex}`}>
							<div className="flex items-center justify-between gap-4 py-2">
								<div className="flex items-center gap-2 min-w-0">
									<span className="text-xs text-muted-foreground truncate">
										{item.is_base ? "Base Price" : item.title}
									</span>
									{!item.is_base && item.total_quantity > 1 && (
										<motion.span
											key={item.total_quantity}
											className="text-xs text-muted-foreground shrink-0"
											initial={{ opacity: 0, scale: 0.9 }}
											animate={{ opacity: 1, scale: 1 }}
											transition={FAST_TRANSITION}
										>
											x{item.total_quantity}
										</motion.span>
									)}
								</div>
								<motion.span
									key={item.amount}
									className="text-xs tabular-nums text-muted-foreground shrink-0"
									initial={{ opacity: 0.5 }}
									animate={{ opacity: 1 }}
									transition={FAST_TRANSITION}
								>
									{formatAmount(item.amount, currency)}
								</motion.span>
							</div>
							{itemIndex < sortedItems.length - 1 && (
								<Separator className="opacity-50" />
							)}
						</div>
					))
				)}
			</div>
		</div>
	);
}
