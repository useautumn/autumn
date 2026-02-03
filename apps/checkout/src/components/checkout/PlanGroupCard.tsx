import type { PreviewLineItem } from "@autumn/shared";
import { Clock, Minus, Plus } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { Separator } from "@/components/ui/separator";
import { FAST_TRANSITION, LAYOUT_TRANSITION, listItemVariants } from "@/lib/animations";
import { cn } from "@/lib/utils";
import { formatAmount } from "@/utils/formatUtils";
import { CardBackground } from "@/components/checkout/CardBackground";

type PlanChangeType = "incoming" | "outgoing";

interface PlanGroupCardProps {
	planId: string;
	planName: string;
	items: PreviewLineItem[];
	currency: string;
	index: number;
	type: PlanChangeType;
}

export function PlanGroupCard({
	planId,
	planName,
	items,
	currency,
	index,
	type,
}: PlanGroupCardProps) {
	const Icon = type === "outgoing" ? Minus : Plus;
	const groupTotal = items.reduce((sum, item) => sum + item.amount, 0);

	// Check if all items in this group are deferred for trial
	const allDeferred =
		items.length > 0 && items.every((item) => item.deferred_for_trial);

	// Sort items so base price appears first
	const sortedItems = [...items].sort((a, b) => {
		if (a.is_base && !b.is_base) return -1;
		if (!a.is_base && b.is_base) return 1;
		return 0;
	});

	return (
		<motion.div
			layout
			layoutId={`plan-group-${planId}`}
			variants={listItemVariants}
			initial="initial"
			animate="animate"
			exit="exit"
			transition={{
				layout: LAYOUT_TRANSITION,
				opacity: { duration: 0.2, delay: index * 0.03 },
			}}
			className="rounded-lg border border-border overflow-hidden"
		>
			<CardBackground>

			{/* After trial banner */}
			{allDeferred && (
				<div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/50 border-b text-xs text-muted-foreground">
					<Clock className="h-3 w-3" weight="bold" />
					<span>Charged after trial ends</span>
				</div>
			)}

			{/* Plan header */}
			<div className="flex items-center justify-between px-3 py-2.5 border-b bg-background/50">
				<div className="flex items-center gap-2">
					<Icon
						className={cn(
							"h-4 w-4",
							type === "outgoing"
								? "dark:text-red-400/60 text-red-500"
								: "dark:text-emerald-400/60 text-emerald-500"
						)}
						weight="bold"
					/>
					<span className="text-sm font-semibold text-foreground">
						{planName}
					</span>
				</div>
				<span className="text-sm font-semibold tabular-nums text-foreground">
					{formatAmount(groupTotal, currency)}
				</span>
			</div>

			{/* Line items for this plan */}
			<div className="px-3">
				{sortedItems.length === 0 ? (
					<div className="flex items-center justify-between py-2">
						<span className="text-xs text-muted-foreground">
							{type === "outgoing" ? "No charges" : "Free"}
						</span>
						<span className="text-xs tabular-nums text-muted-foreground">
							{formatAmount(0, currency)}
						</span>
					</div>
				) : (
					sortedItems.map((item, itemIndex) => (
						<div key={`${item.title}-${itemIndex}`}>
							<div className="flex items-center justify-between py-2">
								<div className="flex items-center gap-2">
									<span className="text-xs text-muted-foreground">
										{item.is_base ? "Base Price" : item.title}
									</span>
									{!item.is_base && item.total_quantity > 1 && (
										<motion.span
											key={item.total_quantity}
											className="text-xs text-muted-foreground/70"
											initial={{ opacity: 0, scale: 0.9 }}
											animate={{ opacity: 1, scale: 1 }}
											transition={FAST_TRANSITION}
										>
											x{item.total_quantity}
										</motion.span>
									)}
								</div>
								<div className="flex items-center gap-2">
									{/* Show "After trial" for individual deferred items (only if not all are deferred) */}
									{item.deferred_for_trial && !allDeferred && (
										<span className="flex items-center gap-1 text-xs text-muted-foreground/70">
											<Clock className="h-3 w-3" weight="bold" />
											After trial
										</span>
									)}
									<motion.span
										key={item.amount}
										className="text-xs tabular-nums text-muted-foreground"
										initial={{ opacity: 0.5 }}
										animate={{ opacity: 1 }}
										transition={FAST_TRANSITION}
									>
										{formatAmount(item.amount, currency)}
									</motion.span>
								</div>
							</div>
							{itemIndex < sortedItems.length - 1 && (
								<Separator className="opacity-50" />
							)}
						</div>
					))
				)}
			</div>
			</CardBackground>
		</motion.div>
	);
}
