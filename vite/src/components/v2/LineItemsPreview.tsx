import { type BillingPreviewResponse, formatAmount } from "@autumn/shared";
import { Decimal } from "decimal.js";
import { AnimatePresence, motion } from "motion/react";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/v2/badges/Badge";
import {
	LAYOUT_TRANSITION,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { cn } from "@/lib/utils";

/** Line item type from BillingPreviewResponse */
export type BillingLineItem = BillingPreviewResponse["line_items"][number];

export interface LineItemsPreviewProps<T extends BillingLineItem> {
	/** Section title */
	title?: string;
	/** Whether to show separator above section */
	withSeparator?: boolean;
	/** Whether data is loading */
	isLoading?: boolean;
	/** Line items to display */
	lineItems?: T[];
	/** Currency code for formatting amounts */
	currency?: string;
	/** Filter zero-amount items */
	filterZeroAmounts?: boolean;
	/** Optional totals to display below line items */
	totals?: {
		label: string;
		amount: number;
		variant?: "primary" | "secondary";
		badge?: string;
	}[];
	/** Accordion title for line items */
	accordionTitle?: string;
}

function LineItemsSkeleton() {
	return (
		<div className="flex flex-col gap-2">
			{/* Accordion trigger skeleton - matches py-1 and text-sm */}
			<div className="flex items-center justify-between py-1">
				<Skeleton className="h-[14px] w-20 rounded-sm" />
				<Skeleton className="h-[14px] w-[14px] rounded-sm" />
			</div>
			{/* Total row skeleton - matches text-sm */}
			<div className="flex items-center justify-between">
				<Skeleton className="h-[14px] w-28 rounded-sm" />
				<Skeleton className="h-[14px] w-16 rounded-sm" />
			</div>
		</div>
	);
}

export function LineItemsPreview<T extends BillingLineItem>({
	title = "Pricing Preview",
	withSeparator = false,
	isLoading = false,
	lineItems = [],
	currency = "usd",
	filterZeroAmounts = true,
	totals = [],
	accordionTitle = "Line Items",
}: LineItemsPreviewProps<T>) {
	const filteredItems = filterZeroAmounts
		? lineItems.filter((item) => item.amount !== 0)
		: lineItems;

	const hasContent = filteredItems.length > 0 || totals.length > 0;

	if (!isLoading && !hasContent) return null;

	return (
		<SheetSection title={title} withSeparator={withSeparator}>
			<motion.div layout transition={{ layout: LAYOUT_TRANSITION }}>
				<AnimatePresence mode="wait" initial={false}>
					{isLoading ? (
						<motion.div
							key="loading"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.3 }}
						>
							<LineItemsSkeleton />
						</motion.div>
					) : (
						<motion.div
							key="content"
							layout
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{
								opacity: { duration: 0.3 },
								layout: LAYOUT_TRANSITION,
							}}
							className="flex flex-col gap-2"
						>
							{/* Line Items (collapsible) */}
							{filteredItems.length > 0 && (
								<Accordion type="single" collapsible className="w-full">
									<AccordionItem value="line-items" className="border-none">
										<AccordionTrigger
											className={cn(
												"group py-1 hover:no-underline",
												"data-[state=open]:text-foreground hover:text-foreground",
												"[&>svg]:group-hover:text-foreground [&>svg]:group-data-[state=open]:text-foreground",
											)}
										>
											<span className="text-sm font-medium">
												{accordionTitle}
											</span>
										</AccordionTrigger>
										<AccordionContent className="pb-2 pt-1">
											<div className="space-y-2">
												{filteredItems.map((item) => (
													<div
														key={item.description}
														className="flex items-center justify-between"
													>
														<span className="text-sm truncate max-w-75 text-t3">
															{item.description}
														</span>
														<span className="text-sm text-t1 font-semibold w-24 text-right">
															{formatAmount({
																amount: new Decimal(item.amount)
																	.toDecimalPlaces(2)
																	.toNumber(),
																currency,
																minFractionDigits: 2,
																amountFormatOptions: {
																	currencyDisplay: "narrowSymbol",
																},
															})}
														</span>
													</div>
												))}
											</div>
										</AccordionContent>
									</AccordionItem>
								</Accordion>
							)}

							{/* Totals */}
							{totals.length > 0 && (
								<div className="space-y-1 text-sm">
									{totals.map((total) => (
										<div
											key={total.label}
											className="flex items-center justify-between"
										>
											<span
												className={cn(
													"font-medium flex items-center gap-2",
													total.variant === "secondary"
														? "text-t4"
														: "text-foreground",
												)}
											>
												{total.label}
												{total.badge && (
													<Badge variant="muted">{total.badge}</Badge>
												)}
											</span>
											<span
												className={
													total.variant === "secondary"
														? "font-semibold text-t4"
														: "font-semibold text-foreground"
												}
											>
												{formatAmount({
													amount: new Decimal(total.amount)
														.toDecimalPlaces(2)
														.toNumber(),
													currency,
													minFractionDigits: 2,
													amountFormatOptions: {
														currencyDisplay: "narrowSymbol",
													},
												})}
											</span>
										</div>
									))}
								</div>
							)}
						</motion.div>
					)}
				</AnimatePresence>
			</motion.div>
		</SheetSection>
	);
}
