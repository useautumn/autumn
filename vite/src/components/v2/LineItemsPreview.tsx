import { type BillingPreviewResponse, formatAmount } from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { Transition } from "motion/react";
import { AnimatePresence, motion } from "motion/react";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/v2/badges/Badge";
import { LoadingShimmerText } from "@/components/v2/LoadingShimmerText";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { cn } from "@/lib/utils";

/** Smooth transition for layout animations */
const LAYOUT_TRANSITION: Transition = {
	type: "spring",
	stiffness: 500,
	damping: 40,
	mass: 1,
};

/** Transition for opacity changes */
const OPACITY_TRANSITION: Transition = {
	duration: 0.35,
	ease: "easeInOut",
};

/** Line item type from BillingPreviewResponse */
export type BillingLineItem = BillingPreviewResponse["line_items"][number];

export interface LineItemsPreviewProps<T extends BillingLineItem> {
	/** Section title */
	title?: string;
	/** Whether to show separator above section */
	withSeparator?: boolean;
	/** Whether data is loading */
	isLoading?: boolean;
	/** Loading text to display */
	loadingText?: string;
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

export function LineItemsPreview<T extends BillingLineItem>({
	title = "Pricing Preview",
	withSeparator = false,
	isLoading = false,
	loadingText = "Calculating totals",
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
			{/* Outer wrapper that animates height changes */}
			<motion.div
				layout
				transition={{ layout: LAYOUT_TRANSITION }}
				style={{ position: "relative" }}
			>
				<AnimatePresence mode="wait" initial={false}>
					{isLoading ? (
						<motion.div
							key="loading"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.15, ease: "easeOut" }}
						>
							<LoadingShimmerText text={loadingText} className="py-2" />
						</motion.div>
					) : (
						<motion.div
							key="content"
							layout
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{
								opacity: { duration: 0.25, ease: "easeOut" },
								layout: LAYOUT_TRANSITION,
							}}
							className="flex flex-col gap-2"
						>
							{/* Line Items (collapsible) */}
							<AnimatePresence mode="popLayout" initial={false}>
								{filteredItems.length > 0 && (
									<motion.div
										key="accordion-wrapper"
										layout
										initial={{ opacity: 0 }}
										animate={{ opacity: 1 }}
										exit={{ opacity: 0 }}
										transition={{
											opacity: OPACITY_TRANSITION,
											layout: LAYOUT_TRANSITION,
										}}
									>
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
													<motion.div
														layout
														className="space-y-2"
														transition={{ layout: LAYOUT_TRANSITION }}
													>
														<AnimatePresence mode="popLayout" initial={false}>
															{filteredItems.map((item) => (
																<motion.div
																	key={item.description}
																	layout
																	initial={{ opacity: 0 }}
																	animate={{ opacity: 1 }}
																	exit={{ opacity: 0 }}
																	transition={{
																		opacity: OPACITY_TRANSITION,
																		layout: LAYOUT_TRANSITION,
																	}}
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
																</motion.div>
															))}
														</AnimatePresence>
													</motion.div>
												</AccordionContent>
											</AccordionItem>
										</Accordion>
									</motion.div>
								)}
							</AnimatePresence>

							{/* Totals */}
							<AnimatePresence mode="popLayout" initial={false}>
								{totals.length > 0 && (
									<motion.div
										key="totals-wrapper"
										layout
										initial={{ opacity: 0 }}
										animate={{ opacity: 1 }}
										exit={{ opacity: 0 }}
										transition={{
											opacity: OPACITY_TRANSITION,
											layout: LAYOUT_TRANSITION,
										}}
										className="space-y-1 text-sm"
									>
										{totals.map((total) => (
											<motion.div
												key={total.label}
												layout
												initial={{ opacity: 0 }}
												animate={{ opacity: 1 }}
												exit={{ opacity: 0 }}
												transition={{
													opacity: OPACITY_TRANSITION,
													layout: LAYOUT_TRANSITION,
												}}
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
											</motion.div>
										))}
									</motion.div>
								)}
							</AnimatePresence>
						</motion.div>
					)}
				</AnimatePresence>
			</motion.div>
		</SheetSection>
	);
}
