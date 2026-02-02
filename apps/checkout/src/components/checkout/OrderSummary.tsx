import type { BillingPreviewResponse, PreviewLineItem } from "@autumn/shared";
import { format } from "date-fns";
import { AnimatePresence, motion } from "motion/react";
import { AnimatedLayout } from "@/components/motion/animated-layout";
import { Separator } from "@/components/ui/separator";
import {
	FAST_TRANSITION,
	STANDARD_TRANSITION,
	listContainerVariants,
	listItemVariants,
} from "@/lib/animations";
import { formatAmount } from "@/utils/formatUtils";

interface OrderSummaryProps {
	planName: string;
	preview: BillingPreviewResponse;
}

export function OrderSummary({ planName, preview }: OrderSummaryProps) {
	const { line_items, total, currency, period_start, period_end, next_cycle } =
		preview;

	const hasBillingPeriod = period_start && period_end;
	const hasNoImmediateCharges = line_items.length === 0 && total === 0;
	const showNextCycleBreakdown = hasNoImmediateCharges && next_cycle;

	// Use next cycle line items when showing next cycle breakdown, otherwise use immediate line items
	const displayLineItems: PreviewLineItem[] = showNextCycleBreakdown
		? next_cycle.line_items
		: line_items;
	const displayTotal = showNextCycleBreakdown ? next_cycle.total : total;

	// Separate base item from sub-items
	const baseItem = displayLineItems.find((item) => item.is_base);
	const subItems = displayLineItems.filter((item) => !item.is_base);

	return (
		<AnimatedLayout
			className="flex flex-col"
			layoutId="order-summary"
			variants={listContainerVariants}
			initial="initial"
			animate="animate"
		>
			{/* Plan name and billing period */}
			<motion.div
				className="flex items-center justify-between pb-3"
				variants={listItemVariants}
			>
				<span className="text-foreground">{planName}</span>
				{hasBillingPeriod && (
					<motion.span
						className="text-sm text-muted-foreground"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ ...STANDARD_TRANSITION, delay: 0.1 }}
					>
						{format(period_start, "d MMM yyyy")}
					</motion.span>
				)}
			</motion.div>

			<motion.div
				initial={{ scaleX: 0, originX: 0 }}
				animate={{ scaleX: 1 }}
				transition={STANDARD_TRANSITION}
			>
				<Separator />
			</motion.div>

			{/* Line items */}
			<div className="flex flex-col">
				{/* Base item */}
				<AnimatePresence mode="popLayout">
					{baseItem && (
						<motion.div
							key="base-item"
							layout
							variants={listItemVariants}
							initial="initial"
							animate="animate"
							exit="exit"
						>
							<div className="flex items-center justify-between py-3">
								<span className="text-sm text-muted-foreground">Base Price</span>
								<motion.span
									key={baseItem.amount}
									className="text-sm tabular-nums text-muted-foreground"
									initial={{ opacity: 0.5 }}
									animate={{ opacity: 1 }}
									transition={FAST_TRANSITION}
								>
									{formatAmount(baseItem.amount, currency)}
								</motion.span>
							</div>
							<Separator />
						</motion.div>
					)}
				</AnimatePresence>

				{/* Sub-items */}
				<AnimatePresence mode="popLayout">
					{subItems.map((item, index) => (
						<motion.div
							key={item.title}
							layout
							variants={listItemVariants}
							initial="initial"
							animate="animate"
							exit="exit"
							transition={{ ...STANDARD_TRANSITION, delay: index * 0.03 }}
						>
							<div className="flex items-center justify-between py-3">
								<div className="flex items-center gap-2">
									<span className="text-sm text-muted-foreground">
										{item.title}
									</span>
									{item.total_quantity > 1 && (
										<motion.span
											key={item.total_quantity}
											className="text-sm text-muted-foreground"
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
							{index < subItems.length - 1 && <Separator />}
						</motion.div>
					))}
				</AnimatePresence>

				{/* Total row */}
				<motion.div
					initial={{ scaleX: 0, originX: 0 }}
					animate={{ scaleX: 1 }}
					transition={{ ...STANDARD_TRANSITION, delay: 0.1 }}
				>
					<Separator />
				</motion.div>
				<motion.div
					className="flex items-center justify-between py-3"
					variants={listItemVariants}
					initial="initial"
					animate="animate"
					transition={{ ...STANDARD_TRANSITION, delay: 0.15 }}
				>
					<span className="text-sm font-medium text-foreground">Total</span>
					<motion.span
						key={displayTotal}
						className="text-sm font-medium tabular-nums text-foreground"
						initial={{ opacity: 0.5, scale: 0.95 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={FAST_TRANSITION}
					>
						{formatAmount(displayTotal, currency)}
					</motion.span>
				</motion.div>

				{/* Message explaining changes take effect next cycle */}
				{showNextCycleBreakdown && (
					<motion.p
						className="text-xs text-muted-foreground"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ ...STANDARD_TRANSITION, delay: 0.2 }}
					>
						Changes take effect{" "}
						{format(new Date(next_cycle.starts_at), "d MMM yyyy")}
					</motion.p>
				)}
			</div>
		</AnimatedLayout>
	);
}
