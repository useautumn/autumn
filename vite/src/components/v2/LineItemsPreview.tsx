import { type BillingPreviewResponse, formatAmount } from "@autumn/shared";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
	Badge,
} from "@autumn/ui";
import { Decimal } from "decimal.js";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { cn } from "@/lib/utils";

/** Line item type from BillingPreviewResponse */
export type BillingLineItem = BillingPreviewResponse["line_items"][number];

export interface LineItemsContentProps<T extends BillingLineItem> {
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

export interface LineItemsPreviewProps<T extends BillingLineItem>
	extends LineItemsContentProps<T> {
	/** Section title */
	title?: string;
	/** Whether to show separator above section */
	withSeparator?: boolean;
}

const visibleLineItems = <T extends BillingLineItem>({
	lineItems = [],
	filterZeroAmounts = true,
}: Pick<LineItemsContentProps<T>, "lineItems" | "filterZeroAmounts">) =>
	filterZeroAmounts ? lineItems.filter((item) => item.total !== 0) : lineItems;

export const hasLineItemsContent = <T extends BillingLineItem>({
	lineItems,
	filterZeroAmounts,
	totals = [],
}: LineItemsContentProps<T>) =>
	visibleLineItems({ lineItems, filterZeroAmounts }).length > 0 ||
	totals.length > 0;

const amountLabel = ({
	amount,
	currency,
}: {
	amount: number;
	currency: string;
}) =>
	formatAmount({
		amount: new Decimal(amount).toDecimalPlaces(2).toNumber(),
		currency,
		minFractionDigits: 2,
		amountFormatOptions: { currencyDisplay: "narrowSymbol" },
	});

/** Line items accordion plus totals rows, with no section chrome of its own. */
export function LineItemsContent<T extends BillingLineItem>({
	lineItems,
	currency = "usd",
	filterZeroAmounts = true,
	totals = [],
	accordionTitle = "Line Items",
}: LineItemsContentProps<T>) {
	const filteredItems = visibleLineItems({ lineItems, filterZeroAmounts });

	if (filteredItems.length === 0 && totals.length === 0) return null;

	return (
		<div className="flex flex-col gap-2">
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
										className="flex items-center gap-3"
									>
										<span className="min-w-0 flex-1 truncate text-sm text-tertiary-foreground">
											{item.description}
										</span>
										<div className="flex shrink-0 items-center justify-end gap-1.5">
											{item.subtotal !== item.total && (
												<span className="text-sm text-tertiary-foreground line-through">
													{amountLabel({ amount: item.subtotal, currency })}
												</span>
											)}
											<span className="text-sm text-foreground font-semibold text-right">
												{amountLabel({ amount: item.total, currency })}
											</span>
										</div>
									</div>
								))}
							</div>
						</AccordionContent>
					</AccordionItem>
				</Accordion>
			)}

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
										? "text-subtle"
										: "text-foreground",
								)}
							>
								{total.label}
								{total.badge && <Badge variant="muted">{total.badge}</Badge>}
							</span>
							<span
								className={
									total.variant === "secondary"
										? "font-semibold text-subtle"
										: "font-semibold text-foreground"
								}
							>
								{amountLabel({ amount: total.amount, currency })}
							</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export function LineItemsPreview<T extends BillingLineItem>({
	title = "Pricing Preview",
	withSeparator = false,
	...contentProps
}: LineItemsPreviewProps<T>) {
	if (!hasLineItemsContent(contentProps)) return null;

	return (
		<SheetSection title={title} withSeparator={withSeparator}>
			<LineItemsContent {...contentProps} />
		</SheetSection>
	);
}
