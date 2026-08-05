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
import { getBackendErr } from "@/utils/genUtils";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { PreviewErrorDisplay } from "./PreviewErrorDisplay";
import { getPreviewCreditAmount } from "./previewCreditUtils";
import { buildPreviewTotals } from "./utils/buildPreviewTotals";

const TITLE = "Pricing Preview";
const ERROR_FALLBACK = "Failed to load preview";
const LOADING_LABEL = "Calculating pricing";

export const PREVIEW_REVEAL_TRANSITION: Transition = {
	duration: 0.25,
	ease: [0.32, 0.72, 0, 1],
};

/** The only thing on screen until a preview has fully resolved. */
export function PreviewLoadingSection() {
	return (
		<SheetSection withSeparator={false}>
			<LoadingShimmerText text={LOADING_LABEL} />
		</SheetSection>
	);
}

type PreviewLineItems = ComponentProps<typeof LineItemsContent>["lineItems"];

/** Loose enough to accept every billing preview response shape. */
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
	tax?: { total: number; status: "complete" | "incomplete" };
	invoice_credits?: { balance: number };
	checkout_type?: "stripe_checkout" | "autumn_checkout" | null;
};

/** Optional fields so confirmation stages can pass a bare `{ data }`. */
export type PreviewSectionQuery = {
	isLoading?: boolean;
	data?: (PreviewData & object) | null;
	error?: unknown;
};

/**
 * Who renders the bottom-line amount. "block" is the subtotal/tax/credits
 * stack; "row" is a plain total under the line items; "none" suits flows
 * where nothing is due now.
 */
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

/**
 * Shared pricing preview. Nothing renders until the whole preview has
 * resolved — a shimmer holds the section, then the full block folds in.
 */
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
	/** Nothing to preview yet — render nothing at all. */
	hidden?: boolean;
	/** Override when the flow has extra loading state of its own. */
	isLoading?: boolean;
	/** Defaults to the response's line items. */
	lineItems?: PreviewLineItems;
	filterZeroAmounts?: boolean;
	/** Keep the last preview on screen through a refetch instead of flashing the error. */
	suppressErrorWhileLoading?: boolean;
	totalDue?: TotalDueMode;
	/** Turn off where a negative total is a refund rather than credit on file. */
	showCreditNote?: boolean;
	/** A future start date moves the whole charge to that date. */
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

	if (loading) return <PreviewLoadingSection />;

	if (!previewData) return null;

	const totals = buildPreviewTotals({
		previewData,
		startDate,
		refundBehavior,
		includeNextCycle,
		nextCycleVariant,
		includeTotalDue: totalDue === "row",
	});

	// A future start date makes buildPreviewTotals emit its own primary row,
	// so the block would be a second, contradictory bottom line.
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
