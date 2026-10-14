import { type BillingPreviewResponse, formatAmount } from "@autumn/shared";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
	Badge,
} from "@autumn/ui";
import {
	ArrowCounterClockwiseIcon,
	CircleNotchIcon,
	XIcon,
} from "@phosphor-icons/react";
import { Decimal } from "decimal.js";
import type { ReactNode } from "react";
import { AddInvoiceLineForm } from "@/components/forms/shared/invoiceLineEdits/AddInvoiceLineForm";
import type { InvoiceLineEditsController } from "@/components/forms/shared/invoiceLineEdits/useInvoiceLineEdits";
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
	/** Set when the previewed invoice accepts add_lines / remove_lines. */
	lineEdits?: InvoiceLineEditsController;
	/** A refetch is in flight, so removals and additions are still settling. */
	isRefreshing?: boolean;
	/** remove_lines is accepted, so lines with a selector get a ×. */
	linesRemovable?: boolean;
	/** add_lines is accepted, so the add control shows. */
	linesAddable?: boolean;
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

/** Server appends add_lines in request order, so the nth custom line is the nth added line. */
const addedLineIndexByItem = <T extends BillingLineItem>({
	lineItems = [],
	lineEdits,
}: {
	lineItems?: T[];
	lineEdits?: InvoiceLineEditsController;
}) => {
	const indexByItem = new Map<T, number>();
	if (!lineEdits) return indexByItem;
	let customIndex = 0;
	for (const item of lineItems) {
		if (!item.custom) continue;
		if (customIndex < lineEdits.added.length)
			indexByItem.set(item, customIndex);
		customIndex += 1;
	}
	return indexByItem;
};

const RowIconButton = ({
	label,
	onClick,
	children,
}: {
	label: string;
	onClick: () => void;
	children: ReactNode;
}) => (
	<button
		aria-label={label}
		className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-tertiary-foreground hover:bg-interactive-secondary-hover hover:text-foreground"
		onClick={onClick}
		title={label}
		type="button"
	>
		{children}
	</button>
);

/** Line items accordion plus totals rows, with no section chrome of its own. */
export function LineItemsContent<T extends BillingLineItem>({
	lineItems,
	currency = "usd",
	filterZeroAmounts = true,
	totals = [],
	accordionTitle = "Line Items",
	lineEdits,
	isRefreshing = false,
	linesRemovable = false,
	linesAddable = false,
}: LineItemsContentProps<T>) {
	const removedSelectors = new Set(
		(lineEdits?.removed ?? []).map(({ removeLine }) =>
			JSON.stringify(removeLine),
		),
	);
	// Until the refetch lands, the stale preview still holds lines that were just removed.
	const filteredItems = visibleLineItems({
		lineItems,
		filterZeroAmounts,
	}).filter(
		(item) =>
			!item.remove_line ||
			!removedSelectors.has(JSON.stringify(item.remove_line)),
	);
	const addedIndexByItem = addedLineIndexByItem({ lineItems, lineEdits });
	const removedLines = lineEdits?.removed ?? [];
	const showLineList =
		filteredItems.length > 0 || removedLines.length > 0 || !!lineEdits;

	if (!showLineList && totals.length === 0) return null;

	return (
		<div className="flex flex-col gap-2">
			{showLineList && (
				<Accordion
					type="single"
					collapsible
					className="w-full"
					defaultValue={lineEdits?.hasEdits ? ["line-items"] : undefined}
				>
					<AccordionItem value="line-items" className="border-none">
						<AccordionTrigger
							className={cn(
								"group cursor-pointer py-1 hover:no-underline",
								"data-[state=open]:text-foreground hover:text-foreground",
								"[&>svg]:group-hover:text-foreground [&>svg]:group-data-[state=open]:text-foreground",
							)}
						>
							<span className="text-sm font-medium">{accordionTitle}</span>
						</AccordionTrigger>
						<AccordionContent className="pb-2 pt-1">
							<div className="space-y-2">
								{filteredItems.map((item, itemIndex) => {
									const addedIndex = addedIndexByItem.get(item) ?? -1;
									const removeLine = linesRemovable ? item.remove_line : null;
									return (
										<div
											key={`${item.description}-${itemIndex}`}
											className="flex items-center gap-3"
										>
											<span className="min-w-0 flex-1 truncate text-sm text-tertiary-foreground">
												{item.description}
											</span>
											{addedIndex !== -1 && (
												<Badge variant="muted">Added</Badge>
											)}
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
											{lineEdits &&
												// Stale rows would map to shifted indexes until the refetch lands.
												(addedIndex !== -1 && isRefreshing ? (
													<span className="flex size-5 shrink-0 items-center justify-center text-tertiary-foreground">
														<CircleNotchIcon
															size={12}
															className="animate-spin"
														/>
													</span>
												) : addedIndex !== -1 ? (
													<RowIconButton
														label="Delete added line"
														onClick={() =>
															lineEdits.removeAddedLine(addedIndex)
														}
													>
														<XIcon size={12} />
													</RowIconButton>
												) : removeLine ? (
													<RowIconButton
														label="Remove line from invoice"
														onClick={() => lineEdits.removeLine(item)}
													>
														<XIcon size={12} />
													</RowIconButton>
												) : (
													<span className="size-5 shrink-0" />
												))}
										</div>
									);
								})}
								{removedLines.map(({ lineItem }, removedIndex) => (
									<div
										key={`removed-${lineItem.description}-${removedIndex}`}
										className="flex items-center gap-3"
									>
										<span className="min-w-0 flex-1 truncate text-sm text-tertiary-foreground line-through">
											{lineItem.description}
										</span>
										<Badge variant="muted">Removed</Badge>
										<span className="shrink-0 text-sm text-tertiary-foreground line-through">
											{amountLabel({ amount: lineItem.total, currency })}
										</span>
										{isRefreshing ? (
											<span className="flex size-5 shrink-0 items-center justify-center text-tertiary-foreground">
												<CircleNotchIcon size={12} className="animate-spin" />
											</span>
										) : (
											<RowIconButton
												label="Undo remove"
												onClick={() => lineEdits?.undoRemove(removedIndex)}
											>
												<ArrowCounterClockwiseIcon size={12} />
											</RowIconButton>
										)}
									</div>
								))}
								{lineEdits && linesAddable && (
									<AddInvoiceLineForm onAdd={lineEdits.addLine} />
								)}
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
