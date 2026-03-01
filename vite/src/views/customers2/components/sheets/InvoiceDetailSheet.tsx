import type { Feature, Invoice, InvoiceLineItem } from "@autumn/shared";
import {
	ArrowSquareOutIcon,
	EyeIcon,
	EyeSlashIcon,
} from "@phosphor-icons/react";
import { format } from "date-fns";
import { useMemo, useState } from "react";
import { Badge } from "@/components/v2/badges/Badge";
import { Button } from "@/components/v2/buttons/Button";
import { MiniCopyButton } from "@/components/v2/buttons/CopyButton";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { cn } from "@/lib/utils";
import { useEnv } from "@/utils/envUtils";
import { getStripeInvoiceLink } from "@/utils/linkUtils";
import { CustomerInvoiceStatus } from "../table/customer-invoices/CustomerInvoiceStatus";

interface InvoiceDetailSheetProps {
	invoice: Invoice;
	lineItems: InvoiceLineItem[];
}

type LineItemGroup = {
	groupKey: string;
	label: string;
	isBasePrice: boolean;
	items: InvoiceLineItem[];
	totalAmount: number;
};

type ProductGroup = {
	productId: string | null;
	productName: string;
	lineItemGroups: LineItemGroup[];
};

/** Resolve a feature_id slug to its display name */
const resolveFeatureName = ({
	featureId,
	features,
}: {
	featureId: string | null;
	features: Feature[];
}): string => {
	if (!featureId) return "Base Price";
	const feature = features.find((f) => f.id === featureId);
	return feature?.name ?? featureId;
};

export function InvoiceDetailSheet({
	invoice,
	lineItems,
}: InvoiceDetailSheetProps) {
	const { stripeAccount } = useOrgStripeQuery();
	const { features } = useFeaturesQuery();
	const { products } = useProductsQuery();
	const env = useEnv();
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const [showDescriptions, setShowDescriptions] = useState(false);

	// Group line items: first by product_id, then within each product by
	// stripe_subscription_item_id (for tiered) or individually.
	// Sort: base price first, then alphabetically by label within each product.
	const productGroups = useMemo(() => {
		// Step 1: bucket line items by product_id
		const byProduct = new Map<string, InvoiceLineItem[]>();
		for (const item of lineItems) {
			const key = item.product_id ?? "__unknown__";
			const existing = byProduct.get(key);
			if (existing) {
				existing.push(item);
			} else {
				byProduct.set(key, [item]);
			}
		}

		// Step 2: within each product bucket, group into LineItemGroups
		const result: ProductGroup[] = [];
		for (const [productKey, items] of byProduct) {
			const groups = new Map<string, LineItemGroup>();

			for (const item of items) {
				const groupKey = item.stripe_subscription_item_id ?? item.id;
				const isBasePrice = !item.feature_id;

				const existing = groups.get(groupKey);
				if (existing) {
					existing.items.push(item);
					existing.totalAmount += item.amount;
				} else {
					groups.set(groupKey, {
						groupKey,
						label: isBasePrice
							? "Base Price"
							: resolveFeatureName({
									featureId: item.feature_id,
									features,
								}),
						isBasePrice,
						items: [item],
						totalAmount: item.amount,
					});
				}
			}

			const sortedGroups = Array.from(groups.values()).sort((a, b) => {
				if (a.isBasePrice && !b.isBasePrice) return -1;
				if (!a.isBasePrice && b.isBasePrice) return 1;
				return a.label.localeCompare(b.label);
			});

			const productId = productKey === "__unknown__" ? null : productKey;
			const product = products?.find((p) => p.id === productId);
			const productName = product?.name ?? productId ?? "Unknown Product";

			result.push({
				productId,
				productName,
				lineItemGroups: sortedGroups,
			});
		}

		return result;
	}, [lineItems, features, products]);

	const formatAmount = (amount: number, currency: string) => {
		const absAmount = Math.abs(amount);
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: currency.toUpperCase(),
		}).format(absAmount);
	};

	const formatPeriod = (startMs: number | null, endMs: number | null) => {
		if (!startMs || !endMs) return null;
		const startDate = format(new Date(startMs), "d MMM");
		const endDate = format(new Date(endMs), "d MMM yyyy");
		return `${startDate} – ${endDate}`;
	};

	const formatDate = (timestamp: number) => {
		return format(new Date(timestamp), "MMM d, yyyy");
	};

	const handleViewInvoice = () => {
		if (invoice.hosted_invoice_url) {
			window.open(invoice.hosted_invoice_url, "_blank");
		} else {
			window.open(
				getStripeInvoiceLink({
					stripeInvoice: invoice.stripe_id,
					env,
					accountId: stripeAccount?.id,
				}),
				"_blank",
			);
		}
	};

	return (
		<div className="flex flex-col h-full">
			<SheetHeader
				title={
					<div className="flex items-center gap-2">
						<span>Invoice</span>
						<CustomerInvoiceStatus status={invoice.status ?? "paid"} />
					</div>
				}
				description={`${formatDate(invoice.created_at)} • ${formatAmount(invoice.total, invoice.currency)}`}
			/>

			<div className="flex-1 overflow-y-auto min-h-0">
				{/* Product groups with line items */}
				{productGroups.map((productGroup) => (
					<SheetSection
						key={productGroup.productId ?? "unknown"}
						withSeparator={true}
					>
						{/* Product header with description toggle */}
						<div className="flex items-center justify-between mb-2">
							<span className="text-xs font-medium text-t3 truncate">
								{productGroup.productName}
							</span>
							<button
								type="button"
								onClick={() => setShowDescriptions((prev) => !prev)}
								className="text-t4 hover:text-t2 transition-colors p-0.5 rounded"
								title={
									showDescriptions
										? "Show computed display"
										: "Show descriptions"
								}
							>
								{showDescriptions ? (
									<EyeSlashIcon size={14} />
								) : (
									<EyeIcon size={14} />
								)}
							</button>
						</div>

						{/* Line item groups within this product */}
						<div className="flex flex-col gap-2">
							{productGroup.lineItemGroups.map((group) => (
								<LineItemGroupRow
									key={group.groupKey}
									group={group}
									formatAmount={formatAmount}
									formatPeriod={formatPeriod}
									currency={invoice.currency}
									showDescriptions={showDescriptions}
								/>
							))}
						</div>
					</SheetSection>
				))}

				{/* Invoice Total */}
				<SheetSection withSeparator={true}>
					<div className="flex items-center justify-between">
						<span className="text-sm font-medium text-foreground">Total</span>
						<span className="text-sm font-semibold text-foreground tabular-nums">
							{formatAmount(invoice.total, invoice.currency)}
						</span>
					</div>
				</SheetSection>

				{/* Invoice Details - Compact */}
				<SheetSection withSeparator={false}>
					<div className="space-y-2">
						<div className="flex items-center justify-between text-xs">
							<span className="text-t3">Invoice ID</span>
							<MiniCopyButton
								text={invoice.id}
								innerClassName="text-xs text-t1 font-mono"
							/>
						</div>
						<div className="flex items-center justify-between text-xs">
							<span className="text-t3">Stripe ID</span>
							<MiniCopyButton
								text={invoice.stripe_id}
								innerClassName="text-xs text-t1 font-mono"
							/>
						</div>
						<div className="flex items-center justify-between text-xs">
							<span className="text-t3">Created</span>
							<span className="text-t1">
								{format(new Date(invoice.created_at), "MMM d, yyyy HH:mm")}
							</span>
						</div>
					</div>
				</SheetSection>
			</div>

			{/* Footer */}
			<div className="p-4 flex gap-2 border-t border-border/40">
				<Button variant="secondary" className="flex-1" onClick={closeSheet}>
					Close
				</Button>
				<Button
					variant="primary"
					className="flex-1"
					onClick={handleViewInvoice}
				>
					<ArrowSquareOutIcon size={16} className="mr-1.5" />
					View Invoice
				</Button>
			</div>
		</div>
	);
}

function LineItemGroupRow({
	group,
	formatAmount,
	formatPeriod,
	currency,
	showDescriptions,
}: {
	group: LineItemGroup;
	formatAmount: (amount: number, currency: string) => string;
	formatPeriod: (startMs: number | null, endMs: number | null) => string | null;
	currency: string;
	showDescriptions: boolean;
}) {
	const isSingleItem = group.items.length === 1;
	const firstItem = group.items[0];
	const period = formatPeriod(
		firstItem.effective_period_start,
		firstItem.effective_period_end,
	);

	const hasDiscounts = group.items.some(
		(item) => item.discounts && item.discounts.length > 0,
	);

	const totalQuantity = group.items.reduce(
		(sum, item) => sum + (item.total_quantity ?? 0),
		0,
	);

	// For multi-item groups (tiered), show grouped display
	if (!isSingleItem) {
		return (
			<div className="flex flex-col py-1">
				{/* Group header with label and total */}
				<div className="flex items-start justify-between gap-2">
					<div className="flex flex-col min-w-0 flex-1 gap-0.5">
						{showDescriptions ? (
							<span className="text-xs text-t3">{firstItem.description}</span>
						) : (
							<div className="flex items-center gap-1.5">
								<span className="text-sm text-t1">{group.label}</span>
								{totalQuantity > 0 && (
									<Badge
										variant="muted"
										className="text-[10px] px-1.5 py-0 text-t3"
									>
										Qty: {totalQuantity}
									</Badge>
								)}
							</div>
						)}
						{period && <span className="text-xs text-t4">{period}</span>}
					</div>
					<span className="text-sm tabular-nums text-t1 shrink-0">
						{formatAmount(group.totalAmount, currency)}
					</span>
				</div>

				{/* Tier breakdown - indented and muted */}
				<div className="mt-1 ml-3 flex flex-col gap-0.5">
					{group.items.map((item) => (
						<TierRow
							key={item.id}
							item={item}
							formatAmount={formatAmount}
							currency={currency}
							showDescriptions={showDescriptions}
						/>
					))}
				</div>
			</div>
		);
	}

	// Single item display
	const isRefund = firstItem.direction === "refund";

	const totalDiscountAmount = hasDiscounts
		? firstItem.discounts.reduce((sum, d) => sum + d.amount_off, 0)
		: 0;

	return (
		<div className="flex flex-col py-1">
			<div className="flex items-start justify-between gap-2">
				<div className="flex flex-col min-w-0 flex-1 gap-0.5">
					{showDescriptions ? (
						<span className="text-xs text-t3">{firstItem.description}</span>
					) : (
						<div className="flex items-center gap-1.5">
							<span className="text-sm text-t1">{group.label}</span>
							{!group.isBasePrice && firstItem.total_quantity ? (
								<Badge
									variant="muted"
									className="text-[10px] px-1.5 py-0 text-t3"
								>
									Qty: {firstItem.total_quantity}
								</Badge>
							) : null}
						</div>
					)}
					{period && <span className="text-xs text-t4">{period}</span>}
				</div>
				<div className="flex flex-col items-end shrink-0">
					{/* Show original amount with strikethrough if discounted */}
					{hasDiscounts && totalDiscountAmount > 0 && (
						<span className="text-xs tabular-nums text-t4 line-through">
							{isRefund ? "-" : ""}
							{formatAmount(
								firstItem.amount + totalDiscountAmount,
								firstItem.currency,
							)}
						</span>
					)}
					<span
						className={cn(
							"text-sm tabular-nums",
							isRefund ? "text-amber-600" : "text-t1",
						)}
					>
						{isRefund ? "-" : ""}
						{formatAmount(firstItem.amount, firstItem.currency)}
					</span>
				</div>
			</div>

			{/* Discount details */}
			{hasDiscounts && (
				<div className="mt-1 flex flex-wrap gap-1.5">
					{firstItem.discounts.map((discount) => (
						<DiscountBadge
							key={
								discount.stripe_coupon_id ??
								`${discount.amount_off}-${discount.percent_off}`
							}
							discount={discount}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function TierRow({
	item,
	formatAmount,
	currency,
	showDescriptions,
}: {
	item: InvoiceLineItem;
	formatAmount: (amount: number, currency: string) => string;
	currency: string;
	showDescriptions: boolean;
}) {
	const isRefund = item.direction === "refund";
	const quantityLabel = item.total_quantity ? `${item.total_quantity}` : "";

	return (
		<div className="flex items-center justify-between text-xs text-t3">
			<span>
				{showDescriptions ? item.description : `${quantityLabel} units`}
			</span>
			<span
				className={cn("tabular-nums", isRefund ? "text-amber-500" : "text-t3")}
			>
				{isRefund ? "-" : ""}
				{formatAmount(item.amount, currency)}
			</span>
		</div>
	);
}

function DiscountBadge({
	discount,
}: {
	discount: {
		amount_off: number;
		percent_off?: number;
		stripe_coupon_id?: string;
	};
}) {
	let label = "";

	if (discount.percent_off) {
		label = `${discount.percent_off}% off`;
	} else if (discount.amount_off) {
		label = `$${discount.amount_off} off`;
	}

	return (
		<span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600">
			{label}
			{discount.stripe_coupon_id && (
				<span className="text-emerald-500/70 font-mono">
					{discount.stripe_coupon_id}
				</span>
			)}
		</span>
	);
}
