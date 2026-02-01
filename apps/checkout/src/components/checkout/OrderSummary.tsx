import type { BillingPreviewResponse } from "@autumn/shared";
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
	const { line_items, total, currency, period_start, period_end } = preview;

	const hasBillingPeriod = period_start && period_end;

	// Separate base item from sub-items
	const baseItem = line_items.find((item) => item.is_base);
	const subItems = line_items.filter((item) => !item.is_base);

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
				className="flex items-center justify-between py-3"
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
									{item.total_quantity && (
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
						key={total}
						className="text-sm font-medium tabular-nums text-foreground"
						initial={{ opacity: 0.5, scale: 0.95 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={FAST_TRANSITION}
					>
						{formatAmount(total, currency)}
					</motion.span>
				</motion.div>
			</div>
		</AnimatedLayout>
	);
}
