import { type BillingPreviewResponse, formatAmount } from "@autumn/shared";
import { Decimal } from "decimal.js";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/v2/badges/badge";
import { LoadingShimmerText } from "@/components/v2/LoadingShimmerText";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
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
	if (isLoading) {
		return (
			<SheetSection title={title} withSeparator={withSeparator}>
				<LoadingShimmerText text={loadingText} className="py-2" />
			</SheetSection>
		);
	}

	const filteredItems = filterZeroAmounts
		? lineItems.filter((item) => item.amount !== 0)
		: lineItems;

	if (filteredItems.length === 0 && totals.length === 0) return null;

	return (
		<SheetSection title={title} withSeparator={withSeparator}>
			<div className="flex flex-col gap-2">
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
								<span className="text-sm font-medium">{accordionTitle}</span>
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
									{total.badge && <Badge variant="muted">{total.badge}</Badge>}
								</span>
								<span
									className={
										total.variant === "secondary"
											? "font-semibold text-t4"
											: "font-semibold text-foreground"
									}
								>
									{formatAmount({
										amount: total.amount,
										currency,
										minFractionDigits: 2,
										amountFormatOptions: { currencyDisplay: "narrowSymbol" },
									})}
								</span>
							</div>
						))}
					</div>
				)}
			</div>
		</SheetSection>
	);
}
