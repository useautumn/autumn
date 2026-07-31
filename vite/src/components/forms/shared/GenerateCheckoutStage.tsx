import type {
	AttachPreviewResponse,
	BillingPreviewResponse,
} from "@autumn/shared";
import { Button, Switch } from "@autumn/ui";
import { ArrowLeft, CalendarCheckIcon, LinkIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
	buildAttachPreviewTotals,
	getAttachPreviewLineItems,
	getAttachScheduledStartDate,
} from "@/components/forms/attach-v2/utils/buildAttachPreviewTotals";
import type { BillingLineItem } from "@/components/v2/LineItemsPreview";
import { LineItemsPreview } from "@/components/v2/LineItemsPreview";
import {
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { ConfigRow } from "./ConfigRow";
import { PlanActivationSection } from "./SendInvoiceStage";
import { UrlSuccessView } from "./UrlSuccessView";

type PreviewData =
	| AttachPreviewResponse
	| BillingPreviewResponse
	| null
	| undefined;
type GenerateCheckoutSubmitParams = {
	longLivedCheckout?: boolean;
};
type ActivationControls = {
	enablePlanImmediately: boolean;
	onEnablePlanImmediatelyChange: (value: boolean) => void;
	longLivedCheckout?: boolean;
	onLongLivedCheckoutChange?: (value: boolean) => void;
	showLongLivedCheckout?: boolean;
};

function usePreviewTotals({
	previewData,
	startDate = null,
}: {
	previewData: PreviewData;
	startDate?: number | null;
}) {
	return useMemo(
		() => buildAttachPreviewTotals({ previewData, startDate }),
		[previewData, startDate],
	);
}

function ActivationPreviewStage({
	title,
	description,
	isPending,
	onBack,
	onSubmit,
	lineItems,
	currency,
	totals,
	buttonLabel,
	buttonIcon,
	scheduledStartDate,
	showLongLivedCheckout = false,
	enablePlanImmediately,
	onEnablePlanImmediatelyChange,
	longLivedCheckout,
	onLongLivedCheckoutChange,
}: {
	title: string;
	description: string;
	isPending: boolean;
	onBack: () => void;
	onSubmit: (params?: GenerateCheckoutSubmitParams) => void | Promise<void>;
	lineItems?: BillingLineItem[];
	currency?: string;
	totals?: {
		label: string;
		amount: number;
		variant?: "primary" | "secondary";
		badge?: string;
	}[];
	buttonLabel: string;
	buttonIcon: ReactNode;
	scheduledStartDate?: number | null;
	showLongLivedCheckout?: boolean;
} & ActivationControls) {
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async () => {
		setIsSubmitting(true);
		try {
			await onSubmit(
				showLongLivedCheckout
					? { longLivedCheckout: !!longLivedCheckout }
					: undefined,
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<>
			<SheetHeader title={title} description={description}>
				<button
					type="button"
					onClick={onBack}
					className="flex items-center gap-1 text-tertiary-foreground text-sm cursor-pointer mt-2 hover:text-foreground transition-colors"
				>
					<ArrowLeft size={14} />
					Back
				</button>
			</SheetHeader>

			<PlanActivationSection
				enableImmediately={enablePlanImmediately}
				setEnableImmediately={onEnablePlanImmediatelyChange}
				scheduledStartDate={scheduledStartDate}
			/>

			{showLongLivedCheckout && (
				<SheetSection withSeparator>
					<ConfigRow
						title="Long-lived checkout link"
						description="Link lasts for 90 days. Stripe checkout sessions are only created when required."
						action={
							<Switch
								checked={!!longLivedCheckout}
								onCheckedChange={(enabled) =>
									onLongLivedCheckoutChange?.(!!enabled)
								}
							/>
						}
					/>
				</SheetSection>
			)}

			<LineItemsPreview
				title="Pricing Preview"
				lineItems={lineItems}
				currency={currency}
				totals={totals}
				filterZeroAmounts
			/>

			<SheetFooter className="flex flex-col grid-cols-1 mt-0">
				<Button
					variant="primary"
					className="w-full"
					onClick={handleSubmit}
					isLoading={isSubmitting || isPending}
					disabled={isPending || isSubmitting}
				>
					{buttonIcon}
					{buttonLabel}
				</Button>
			</SheetFooter>
		</>
	);
}

export function GenerateCheckoutStage({
	productName,
	isPending,
	onBack,
	onSubmit,
	lineItems,
	currency,
	totals,
	showLongLivedCheckout = true,
	enablePlanImmediately,
	onEnablePlanImmediatelyChange,
	longLivedCheckout,
	onLongLivedCheckoutChange,
}: {
	productName?: string;
	isPending: boolean;
	onBack: () => void;
	onSubmit: (params?: GenerateCheckoutSubmitParams) => Promise<{
		paymentUrl: string | null | undefined;
	}>;
	lineItems?: BillingLineItem[];
	currency?: string;
	totals?: {
		label: string;
		amount: number;
		variant?: "primary" | "secondary";
		badge?: string;
	}[];
} & ActivationControls) {
	const [completedCheckoutUrl, setCompletedCheckoutUrl] = useState<
		string | null
	>(null);

	const handleGenerate = async (params?: GenerateCheckoutSubmitParams) => {
		const { paymentUrl } = await onSubmit(params);
		if (paymentUrl) {
			setCompletedCheckoutUrl(paymentUrl);
			navigator.clipboard.writeText(paymentUrl);
			toast.success("Checkout URL copied to clipboard");
		} else {
			toast.error("No checkout URL was returned. Please try again.");
		}
	};

	if (completedCheckoutUrl) {
		return (
			<UrlSuccessView
				title="Checkout URL Generated"
				description={
					productName
						? `Checkout session created for ${productName}`
						: "Checkout session has been created"
				}
				message="The checkout URL has been generated and copied to your clipboard."
				buttonLabel="Open checkout URL"
				url={completedCheckoutUrl}
			/>
		);
	}

	return (
		<ActivationPreviewStage
			title="Generate Checkout"
			description={
				productName
					? `Create a checkout session for ${productName}`
					: "Configure checkout session"
			}
			isPending={isPending}
			onBack={onBack}
			onSubmit={handleGenerate}
			lineItems={lineItems}
			currency={currency}
			totals={totals}
			buttonLabel="Generate Checkout URL"
			buttonIcon={<LinkIcon size={16} weight="bold" />}
			showLongLivedCheckout={showLongLivedCheckout}
			enablePlanImmediately={enablePlanImmediately}
			onEnablePlanImmediatelyChange={onEnablePlanImmediatelyChange}
			longLivedCheckout={longLivedCheckout}
			onLongLivedCheckoutChange={onLongLivedCheckoutChange}
		/>
	);
}

export function GenerateCheckoutStageWithPreview({
	productName,
	previewQuery,
	isPending,
	onSubmit,
	onBack,
	...activationControls
}: {
	productName?: string;
	previewQuery: {
		data?: PreviewData;
	};
	isPending: boolean;
	onSubmit: (params?: GenerateCheckoutSubmitParams) => Promise<{
		paymentUrl: string | null | undefined;
	}>;
	onBack: () => void;
} & ActivationControls) {
	const previewData = previewQuery.data;
	const totals = usePreviewTotals({ previewData });

	return (
		<GenerateCheckoutStage
			productName={productName}
			isPending={isPending}
			onBack={onBack}
			onSubmit={onSubmit}
			lineItems={previewData?.line_items}
			currency={previewData?.currency}
			totals={totals}
			{...activationControls}
		/>
	);
}

export function SchedulePlanStageWithPreview({
	productName,
	startDate,
	previewQuery,
	isPending,
	onSubmit,
	onBack,
	enablePlanImmediately,
	onEnablePlanImmediatelyChange,
}: {
	productName?: string;
	startDate: number | null;
	previewQuery: {
		data?: PreviewData;
	};
	isPending: boolean;
	onSubmit: () => void | Promise<void>;
	onBack: () => void;
	enablePlanImmediately: boolean;
	onEnablePlanImmediatelyChange: (value: boolean) => void;
}) {
	const previewData = previewQuery.data;
	const scheduledStartDate = getAttachScheduledStartDate({
		startDate,
		previewData,
	});
	const totals = usePreviewTotals({
		previewData,
		startDate: scheduledStartDate,
	});
	const lineItems = getAttachPreviewLineItems({
		previewData,
		startDate: scheduledStartDate,
	});

	return (
		<ActivationPreviewStage
			title="Preview Schedule"
			description={
				productName
					? `Schedule ${productName} for a future start date`
					: "Review the scheduled plan before confirming"
			}
			isPending={isPending}
			onBack={onBack}
			onSubmit={onSubmit}
			lineItems={lineItems}
			currency={previewData?.currency}
			totals={totals}
			buttonLabel="Schedule Plan"
			buttonIcon={<CalendarCheckIcon size={16} weight="bold" />}
			scheduledStartDate={scheduledStartDate}
			enablePlanImmediately={enablePlanImmediately}
			onEnablePlanImmediatelyChange={onEnablePlanImmediatelyChange}
		/>
	);
}
