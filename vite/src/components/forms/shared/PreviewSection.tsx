import { formatAmount } from "@autumn/shared";
import { LoadingShimmerText } from "@autumn/ui";
import { AxiosError } from "axios";
import { motion, type Transition } from "motion/react";
import type { ComponentProps } from "react";
import {
	hasLineItemsContent,
	LineItemsContent,
} from "@/components/v2/LineItemsPreview";
import { PreviewTotalsBlock } from "@/components/v2/preview-totals/PreviewTotalsBlock";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { cn } from "@/lib/utils";
import { getBackendErr } from "@/utils/genUtils";
import { SHEET_EASE } from "@/views/customers2/customer/customerAnimations";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { PreviewErrorDisplay } from "./PreviewErrorDisplay";
import { getPreviewCreditAmount } from "./previewCreditUtils";
import { buildPreviewTotals } from "./utils/buildPreviewTotals";

const TITLE = "Pricing Preview";
const ERROR_FALLBACK = "Failed to load preview";
const LOADING_LABEL = "Calculating pricing";

export const PREVIEW_REVEAL_TRANSITION: Transition = {
	duration: 0.25,
	ease: SHEET_EASE,
};

export function PreviewLoadingSection() {
	return (
		<SheetSection withSeparator={false}>
			<LoadingShimmerText text={LOADING_LABEL} />
		</SheetSection>
	);
}

type PreviewLineItems = ComponentProps<typeof LineItemsContent>["lineItems"];

type PreviewData = {
	currency: string;
	subtotal: number;
	total: number;
	line_items?: PreviewLineItems;
	next_cycle?: { total: number; starts_at?: number | null } | null;
	refund?: {
		amount: number;
		invoice: { current_refunded_amount: number };
	} | null;
	tax?: {
		total: number;
		status: "complete" | "incomplete" | "requires_location";
	};
	invoice_credits?: { balance: number; applied?: number };
	amount_due?: number;
	checkout_type?: "stripe_checkout" | "autumn_checkout" | null;
};

export type PreviewSectionQuery = {
	isLoading?: boolean;
	data?: (PreviewData & object) | null;
	error?: unknown;
};

type TotalDueMode = "block" | "row" | "none";

const resolvePreviewError = (error: unknown) => {
	if (!error) return undefined;
	if (error instanceof AxiosError) return getBackendErr(error, ERROR_FALLBACK);
	if (error instanceof Error) return error.message || ERROR_FALLBACK;
	return ERROR_FALLBACK;
};

const formatCredit = ({
	amount,
	currency,
}: {
	amount: number;
	currency?: string;
}) =>
	formatAmount({
		amount: Number(amount.toFixed(2)),
		currency,
		minFractionDigits: 2,
		maxFractionDigits: 2,
		amountFormatOptions: { currencyDisplay: "narrowSymbol" },
	});

export function PreviewSection({
	previewQuery,
	hidden = false,
	isLoading,
	lineItems,
	filterZeroAmounts = true,
	suppressErrorWhileLoading = false,
	totalDue = "block",
	showCreditNote = true,
	startDate = null,
	refundBehavior = null,
	includeNextCycle = true,
	nextCycleVariant = "secondary",
}: {
	previewQuery: PreviewSectionQuery;
	hidden?: boolean;
	isLoading?: boolean;
	lineItems?: PreviewLineItems;
	filterZeroAmounts?: boolean;
	suppressErrorWhileLoading?: boolean;
	totalDue?: TotalDueMode;
	showCreditNote?: boolean;
	startDate?: number | null;
	refundBehavior?: string | null;
	includeNextCycle?: boolean;
	nextCycleVariant?: "primary" | "secondary";
}) {
	const { data: previewData, error: queryError } = previewQuery;
	const error = resolvePreviewError(queryError);
	const loading = isLoading ?? previewQuery.isLoading ?? false;

	if (hidden) return null;

	if (error && !(suppressErrorWhileLoading && loading)) {
		return (
			<SheetSection title={TITLE} withSeparator={false}>
				<PreviewErrorDisplay error={error} />
			</SheetSection>
		);
	}

	if (!previewData) return loading ? <PreviewLoadingSection /> : null;

	const totals = buildPreviewTotals({
		previewData,
		startDate,
		refundBehavior,
		includeNextCycle,
		nextCycleVariant,
		includeTotalDue: totalDue === "row",
	});

	const totalsBlockVisible =
		totalDue === "block" &&
		!totals.some((total) => total.variant === "primary");

	const resolvedLineItems = lineItems ?? previewData.line_items;
	const creditAmount = getPreviewCreditAmount({ previewData });
	const creditNoteVisible = showCreditNote && creditAmount > 0;
	const lineItemsVisible = hasLineItemsContent({
		lineItems: resolvedLineItems,
		filterZeroAmounts,
		totals,
	});

	if (!(creditNoteVisible || lineItemsVisible || totalsBlockVisible)) {
		return null;
	}

	return (
		<SheetSection title={TITLE} withSeparator={false}>
			<motion.div
				initial={{ opacity: 0, y: -4 }}
				animate={{ opacity: 1, y: 0 }}
				transition={PREVIEW_REVEAL_TRANSITION}
				aria-busy={loading}
				className={cn("transition-opacity", loading && "opacity-60")}
			>
				<div className="flex flex-col gap-3">
					{creditNoteVisible && (
						<InfoBox variant="note">
							This change includes{" "}
							<span className="text-foreground font-medium">
								{formatCredit({
									amount: creditAmount,
									currency: previewData.currency,
								})}
							</span>{" "}
							in invoice credits.
						</InfoBox>
					)}
					<LineItemsContent
						lineItems={resolvedLineItems}
						currency={previewData.currency}
						totals={totals}
						filterZeroAmounts={filterZeroAmounts}
					/>
					{totalsBlockVisible && (
						<PreviewTotalsBlock previewData={previewData} />
					)}
				</div>
			</motion.div>
		</SheetSection>
	);
}
