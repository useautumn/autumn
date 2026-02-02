import type { PreviewLineItem } from "@autumn/shared";
import { Minus, Plus } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { Separator } from "@/components/ui/separator";
import { FAST_TRANSITION, STANDARD_TRANSITION, listItemVariants } from "@/lib/animations";
import { cn } from "@/lib/utils";
import { formatAmount } from "@/utils/formatUtils";
import { CardBackground } from "@/components/checkout/CardBackground";

type PlanChangeType = "incoming" | "outgoing";

interface PlanGroupCardProps {
	planName: string;
	items: PreviewLineItem[];
	currency: string;
	index: number;
	type: PlanChangeType;
}

export function PlanGroupCard({
	planName,
	items,
	currency,
	index,
	type,
}: PlanGroupCardProps) {
	const Icon = type === "outgoing" ? Minus : Plus;
	const groupTotal = items.reduce((sum, item) => sum + item.amount, 0);

	// Sort items so base price appears first
	const sortedItems = [...items].sort((a, b) => {
		if (a.is_base && !b.is_base) return -1;
		if (!a.is_base && b.is_base) return 1;
		return 0;
	});

	return (
		<motion.div
			layout
			variants={listItemVariants}
			initial="initial"
			animate="animate"
			exit="exit"
			transition={{
				...STANDARD_TRANSITION,
				delay: index * 0.05,
			}}
			className="rounded-lg border border-border overflow-hidden"
		>
			<CardBackground>

			{/* Plan header */}
			<div className="flex items-center justify-between px-3 py-2 border-b bg-background/50">
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
					<span className="text-sm font-medium text-foreground">
						{planName}
					</span>
				</div>
				<span className="text-sm font-medium tabular-nums text-foreground">
					{formatAmount(groupTotal, currency)}
				</span>
			</div>

			{/* Line items for this plan */}
			<div className="px-3">
				{sortedItems.length === 0 ? (
					<div className="flex items-center justify-between py-2.5">
						<span className="text-sm text-muted-foreground">
							{type === "outgoing" ? "No charges" : "Free"}
						</span>
						<span className="text-sm tabular-nums text-muted-foreground">
							{formatAmount(0, currency)}
						</span>
					</div>
				) : (
					sortedItems.map((item, itemIndex) => (
						<div key={`${item.title}-${itemIndex}`}>
							<div className="flex items-center justify-between py-2.5">
								<div className="flex items-center gap-2">
									<span className="text-sm text-muted-foreground">
										{item.is_base ? "Base Price" : item.title}
									</span>
									{!item.is_base && item.total_quantity > 1 && (
										<motion.span
											key={item.total_quantity}
											className="text-xs text-muted-foreground"
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
									className="text-sm tabular-nums text-muted-foreground"
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
			</CardBackground>
		</motion.div>
	);
}
