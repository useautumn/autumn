import {
	type Feature,
	type Invoice,
	type InvoiceLineItem,
	InvoiceStatus,
	ProcessorType,
} from "@autumn/shared";
import {
	ArrowCounterClockwiseIcon,
	ArrowSquareOutIcon,
	CalendarBlankIcon,
	CreditCardIcon,
	HashIcon,
} from "@phosphor-icons/react";
import { format } from "date-fns";
import { useMemo, useState } from "react";
import { AdminHover } from "@/components/general/AdminHover";
import { Badge } from "@/components/v2/badges/Badge";
import { Button } from "@/components/v2/buttons/Button";
import { MiniCopyButton } from "@/components/v2/buttons/CopyButton";
import { InfoRow } from "@/components/v2/InfoRow";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { useEnv } from "@/utils/envUtils";
import { notNullish } from "@/utils/genUtils";
import {
	getStripeConnectViewAsLink,
	getStripeInvoiceLink,
} from "@/utils/linkUtils";
import { useAdmin } from "@/views/admin/hooks/useAdmin";
import { useMasterStripeAccount } from "@/views/admin/hooks/useMasterStripeAccount";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { CustomerInvoiceStatus } from "../table/customer-invoices/CustomerInvoiceStatus";
import { RefundInvoiceDialog } from "./RefundInvoiceDialog";

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

type InvoiceDetailSheetProps = {
	invoice?: Invoice;
	lineItems?: InvoiceLineItem[];
	taxedAmount?: number;
};

/** Resolve feature_id to its display name. */
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
	invoice: invoiceProp,
	lineItems: lineItemsProp,
	taxedAmount: taxedAmountProp,
}: InvoiceDetailSheetProps = {}) {
	const sheetData = useSheetStore((s) => s.data);
	const invoice = invoiceProp ?? (sheetData?.invoice as Invoice | undefined);
	const lineItems =
		lineItemsProp ?? ((sheetData?.lineItems as InvoiceLineItem[]) || []);
	const taxedAmount =
		taxedAmountProp ?? (sheetData?.taxedAmount as number | undefined);

	const { stripeAccount } = useOrgStripeQuery();
	const { features } = useFeaturesQuery();
	const { products } = useProductsQuery();
	const env = useEnv();
	const { isAdmin } = useAdmin();
	const { masterStripeAccount } = useMasterStripeAccount();
	const { data: sessionData } = useSession();
	const [refundDialogOpen, setRefundDialogOpen] = useState(false);
	const { customer } = useCusQuery();

	const productGroups = useMemo(() => {
		// Bucket line items by product_id, then group within each bucket.
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

		const result: ProductGroup[] = [];
		for (const [productKey, items] of byProduct) {
			const groups = new Map<string, LineItemGroup>();

			for (const item of items) {
				const groupKey = item.stripe_subscription_item_id ?? item.id;
				const isBasePrice = !item.feature_id;
				const chargedAmount = item.amount_after_discounts ?? item.amount;

				const existing = groups.get(groupKey);
				if (existing) {
					existing.items.push(item);
					existing.totalAmount += chargedAmount;
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
						totalAmount: chargedAmount,
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

	if (!invoice) return null;

	const isStripeCustomer = customer?.processor?.type === ProcessorType.Stripe;
	const refundableAmount = Math.abs(invoice.amount_paid ?? invoice.total);
	const isFullyRefunded =
		invoice.refunded_amount > 0 && invoice.refunded_amount >= refundableAmount;
	const canRefund =
		isStripeCustomer &&
		invoice.status === InvoiceStatus.Paid &&
		!isFullyRefunded;
	const stripeConnectViewAsInvoiceLink =
		isAdmin &&
		notNullish(sessionData?.session?.impersonatedBy) &&
		masterStripeAccount?.id &&
		stripeAccount?.id
			? getStripeConnectViewAsLink({
					masterAccountId: masterStripeAccount.id,
					connectedAccountId: stripeAccount.id,
					env,
					path: `invoices/${invoice.stripe_id}`,
				})
			: null;

	const formatAmount = (amount: number, currency: string) => {
		const absAmount = Math.abs(amount);
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: currency.toUpperCase(),
		}).format(absAmount);
	};

	const formatSignedAmount = (amount: number, currency: string) => {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: currency.toUpperCase(),
			signDisplay: "auto",
		}).format(amount);
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
		if (stripeConnectViewAsInvoiceLink) {
			window.open(stripeConnectViewAsInvoiceLink, "_blank");
			return;
		}

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
		<div className="flex flex-col h-full overflow-y-auto">
			<SheetHeader
				title={
					<div className="flex items-center gap-2">
						<span>Invoice</span>
						<CustomerInvoiceStatus
							status={invoice.status ?? InvoiceStatus.Paid}
							amountPaid={invoice.amount_paid}
							total={invoice.total}
							refundedAmount={invoice.refunded_amount}
						/>
					</div>
				}
				description={`${formatDate(invoice.created_at)} • ${formatSignedAmount(invoice.total, invoice.currency)}`}
			/>

			{productGroups.map((productGroup) => (
				<SheetSection
					key={productGroup.productId ?? "unknown"}
					withSeparator={true}
				>
					<div className="mb-2">
						<span className="text-xs font-medium text-t3 truncate">
							{productGroup.productName}
						</span>
					</div>

					<div className="flex flex-col gap-2">
						{productGroup.lineItemGroups.map((group) => (
							<LineItemGroupRow
								key={group.groupKey}
								group={group}
								formatAmount={formatAmount}
								formatPeriod={formatPeriod}
								currency={invoice.currency}
							/>
						))}
					</div>
				</SheetSection>
			))}

			{/* Invoice Total */}
			<SheetSection withSeparator={true}>
				<div className="space-y-2">
					{taxedAmount != null && taxedAmount > 0 && (
						<div className="flex items-center justify-between">
							<span className="text-sm text-t2">Tax</span>
							<span className="text-sm tabular-nums text-t2">
								{formatSignedAmount(taxedAmount, invoice.currency)}
							</span>
						</div>
					)}
					<div className="flex items-center justify-between">
						<span className="text-sm font-medium text-foreground">Total</span>
						<span className="text-sm font-semibold text-foreground tabular-nums">
							{formatSignedAmount(invoice.total, invoice.currency)}
						</span>
					</div>
					{invoice.amount_paid != null &&
						invoice.amount_paid !== invoice.total && (
							<div className="flex items-center justify-between">
								<span className="text-sm text-t2">Amount Paid</span>
								<span className="text-sm tabular-nums text-t2">
									{formatSignedAmount(invoice.amount_paid, invoice.currency)}
								</span>
							</div>
						)}
					{invoice.refunded_amount > 0 && (
						<>
							<div className="flex items-center justify-between">
								<span className="text-sm text-t3">Refunded</span>
								<span className="text-sm text-amber-500 tabular-nums">
									-{formatAmount(invoice.refunded_amount, invoice.currency)}
								</span>
							</div>
							<div className="flex items-center justify-between pt-1">
								<span className="text-sm text-t3">Net</span>
								<span className="text-sm font-semibold text-foreground tabular-nums">
									{formatSignedAmount(
										invoice.total - invoice.refunded_amount,
										invoice.currency,
									)}
								</span>
							</div>
						</>
					)}
				</div>
			</SheetSection>

			<SheetSection withSeparator={false}>
				<div className="space-y-3">
					<InfoRow
						icon={<HashIcon size={16} weight="duotone" />}
						label="Invoice ID"
						value={
							<MiniCopyButton
								text={invoice.id}
								innerClassName="text-sm text-t1 font-mono"
							/>
						}
					/>
					<InfoRow
						icon={<CreditCardIcon size={16} weight="duotone" />}
						label="Stripe ID"
						value={
							<MiniCopyButton
								text={invoice.stripe_id}
								innerClassName="text-sm text-t1 font-mono"
							/>
						}
					/>
					<InfoRow
						icon={<CalendarBlankIcon size={16} weight="duotone" />}
						label="Created"
						value={
							<MiniCopyButton
								text={format(new Date(invoice.created_at), "MMM d, yyyy HH:mm")}
								innerClassName="text-sm text-t1"
							/>
						}
					/>
				</div>
			</SheetSection>

			<div className="sticky bottom-0 p-4 flex gap-2 bg-card">
				<Button
					variant="secondary"
					className="flex-1"
					onClick={handleViewInvoice}
				>
					<ArrowSquareOutIcon size={16} className="mr-1.5" />
					Open Invoice
				</Button>
				{canRefund && (
					<Button
						variant="primary"
						className="flex-1"
						onClick={() => setRefundDialogOpen(true)}
					>
						<ArrowCounterClockwiseIcon size={16} className="mr-1.5" />
						Refund Invoice
					</Button>
				)}
			</div>
			{canRefund && (
				<RefundInvoiceDialog
					open={refundDialogOpen}
					onOpenChange={setRefundDialogOpen}
					invoice={invoice}
				/>
			)}
		</div>
	);
}

function LineItemGroupRow({
	group,
	formatAmount,
	formatPeriod,
	currency,
}: {
	group: LineItemGroup;
	formatAmount: (amount: number, currency: string) => string;
	formatPeriod: (startMs: number | null, endMs: number | null) => string | null;
	currency: string;
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

	const getLineItemHoverTexts = (item: InvoiceLineItem) => [
		{
			key: "Line Item ID",
			value: item.id,
		},
		{
			key: "Stripe Line Item ID",
			value: item.stripe_id ?? "N/A",
		},
	];

	// Tiered groups: header + per-tier rows.
	if (!isSingleItem) {
		return (
			<div className="flex flex-col py-1">
				<div className="flex items-start justify-between gap-2">
					<div className="flex flex-col min-w-0 flex-1 gap-0.5">
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
						{firstItem.description && (
							<span className="text-xs text-t3">{firstItem.description}</span>
						)}
						{period && <span className="text-xs text-t4">{period}</span>}
					</div>
					<span className="text-sm tabular-nums text-t1 shrink-0">
						{formatAmount(group.totalAmount, currency)}
					</span>
				</div>

				<div className="mt-1 ml-3 flex flex-col gap-0.5">
					{group.items.map((item) => (
						<TierRow
							key={item.id}
							item={item}
							hoverTexts={getLineItemHoverTexts(item)}
							formatAmount={formatAmount}
							currency={currency}
						/>
					))}
				</div>
			</div>
		);
	}

	const isRefund = firstItem.direction === "refund";
	const paidAmount = firstItem.amount_after_discounts ?? firstItem.amount;

	return (
		<AdminHover asChild texts={getLineItemHoverTexts(firstItem)}>
			<div className="flex flex-col py-1">
				<div className="flex items-start justify-between gap-2">
					<div className="flex flex-col min-w-0 flex-1 gap-0.5">
						<div className="flex items-center gap-1.5">
							<span className="text-sm text-t1">{group.label}</span>
							{(!group.isBasePrice && firstItem.total_quantity) ||
							(group.isBasePrice &&
								firstItem.stripe_quantity &&
								firstItem.stripe_quantity > 1) ? (
								<Badge
									variant="muted"
									className="text-[10px] px-1.5 py-0 text-t3"
								>
									Qty:{" "}
									{group.isBasePrice
										? firstItem.stripe_quantity
										: firstItem.total_quantity}
								</Badge>
							) : null}
						</div>
						{firstItem.description && (
							<span className="text-xs text-t3">{firstItem.description}</span>
						)}
						{period && <span className="text-xs text-t4">{period}</span>}
					</div>
					<div className="flex flex-col items-end shrink-0">
						{hasDiscounts && paidAmount !== firstItem.amount && (
							<span className="text-xs tabular-nums text-t4 line-through">
								{isRefund ? "-" : ""}
								{formatAmount(firstItem.amount, firstItem.currency)}
							</span>
						)}
						<span
							className={cn(
								"text-sm tabular-nums",
								isRefund ? "text-amber-600" : "text-t1",
							)}
						>
							{isRefund ? "-" : ""}
							{formatAmount(paidAmount, firstItem.currency)}
						</span>
					</div>
				</div>

				{hasDiscounts && (
					<div className="mt-1 flex flex-wrap gap-1.5">
						{firstItem.discounts.map((discount) => (
							<DiscountBadge
								key={
									discount.stripe_coupon_id ??
									`${discount.amount_off}-${discount.percent_off}`
								}
								discount={discount}
								currency={firstItem.currency}
								formatAmount={formatAmount}
							/>
						))}
					</div>
				)}
			</div>
		</AdminHover>
	);
}

function TierRow({
	item,
	hoverTexts,
	formatAmount,
	currency,
}: {
	item: InvoiceLineItem;
	hoverTexts: { key: string; value: string }[];
	formatAmount: (amount: number, currency: string) => string;
	currency: string;
}) {
	const isRefund = item.direction === "refund";

	return (
		<AdminHover asChild texts={hoverTexts}>
			<div className="flex items-center justify-between text-xs text-t3">
				<span>{item.description}</span>
				<span
					className={cn(
						"tabular-nums",
						isRefund ? "text-amber-500" : "text-t3",
					)}
				>
					{isRefund ? "-" : ""}
					{formatAmount(item.amount_after_discounts ?? item.amount, currency)}
				</span>
			</div>
		</AdminHover>
	);
}

function DiscountBadge({
	discount,
	currency,
	formatAmount,
}: {
	discount: {
		amount_off: number;
		percent_off?: number | null;
		stripe_coupon_id?: string | null;
	};
	currency: string;
	formatAmount: (amount: number, currency: string) => string;
}) {
	const label = discount.percent_off
		? `${discount.percent_off}% off`
		: `${formatAmount(discount.amount_off, currency)} off`;

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
