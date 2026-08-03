import type { AttachPreviewResponse } from "@autumn/shared";
import { Button, Switch } from "@autumn/ui";
import { ArrowLeft, CalendarCheckIcon, LinkIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";
import {
	getAttachPreviewLineItems,
	getAttachScheduledStartDate,
} from "@/components/forms/attach-v2/utils/buildAttachPreviewTotals";
import type { BillingLineItem } from "@/components/v2/LineItemsPreview";
import {
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { ConfigRow } from "./ConfigRow";
import { PreviewSection, type PreviewSectionQuery } from "./PreviewSection";
import { PlanActivationSection } from "./SendInvoiceStage";
import { UrlSuccessView } from "./UrlSuccessView";

type PreviewData = AttachPreviewResponse | null | undefined;
type GenerateCheckoutSubmitParams = {
	longLivedCheckout?: boolean;
};

/** Owned by each flow's form, so the value survives navigating back and forth. */
export type PlanActivationControls = {
	enablePlanImmediately: boolean;
	onEnablePlanImmediatelyChange: (value: boolean) => void;
	longLivedCheckout?: boolean;
	onLongLivedCheckoutChange?: (value: boolean) => void;
};

function ActivationPreviewStage({
	title,
	description,
	isPending,
	onBack,
	onSubmit,
	previewQuery,
	lineItems,
	buttonLabel,
	buttonIcon,
	scheduledStartDate,
	showLongLivedCheckout = false,
	enablePlanImmediately,
	onEnablePlanImmediatelyChange,
	longLivedCheckout,
	onLongLivedCheckoutChange,
}: PlanActivationControls & {
	title: string;
	description: string;
	isPending: boolean;
	onBack: () => void;
	onSubmit: (params?: GenerateCheckoutSubmitParams) => void | Promise<void>;
	previewQuery: PreviewSectionQuery;
	lineItems?: BillingLineItem[];
	buttonLabel: string;
	buttonIcon: ReactNode;
	scheduledStartDate?: number | null;
	showLongLivedCheckout?: boolean;
}) {
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

			<PreviewSection
				previewQuery={previewQuery}
				lineItems={lineItems}
				startDate={scheduledStartDate}
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
	previewQuery,
	lineItems,
	showLongLivedCheckout = true,
	...activation
}: PlanActivationControls & {
	productName?: string;
	isPending: boolean;
	onBack: () => void;
	onSubmit: (params?: GenerateCheckoutSubmitParams) => Promise<{
		paymentUrl: string | null | undefined;
	}>;
	previewQuery: PreviewSectionQuery;
	lineItems?: BillingLineItem[];
	showLongLivedCheckout?: boolean;
}) {
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
			previewQuery={previewQuery}
			lineItems={lineItems}
			buttonLabel="Generate Checkout URL"
			buttonIcon={<LinkIcon size={16} weight="bold" />}
			showLongLivedCheckout={showLongLivedCheckout}
			{...activation}
		/>
	);
}

export function GenerateCheckoutStageWithPreview({
	productName,
	previewQuery,
	isPending,
	onSubmit,
	onBack,
	showLongLivedCheckout,
	...activation
}: PlanActivationControls & {
	productName?: string;
	previewQuery: PreviewSectionQuery & { data?: PreviewData };
	isPending: boolean;
	onSubmit: (params?: GenerateCheckoutSubmitParams) => Promise<{
		paymentUrl: string | null | undefined;
	}>;
	onBack: () => void;
	showLongLivedCheckout?: boolean;
}) {
	return (
		<GenerateCheckoutStage
			productName={productName}
			isPending={isPending}
			onBack={onBack}
			onSubmit={onSubmit}
			previewQuery={previewQuery}
			showLongLivedCheckout={showLongLivedCheckout}
			{...activation}
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
	...activation
}: PlanActivationControls & {
	productName?: string;
	startDate: number | null;
	previewQuery: PreviewSectionQuery & { data?: PreviewData };
	isPending: boolean;
	onSubmit: () => void | Promise<void>;
	onBack: () => void;
}) {
	const previewData = previewQuery.data;
	const scheduledStartDate = getAttachScheduledStartDate({
		startDate,
		previewData,
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
			previewQuery={previewQuery}
			lineItems={lineItems}
			buttonLabel="Schedule Plan"
			buttonIcon={<CalendarCheckIcon size={16} weight="bold" />}
			scheduledStartDate={scheduledStartDate}
			{...activation}
		/>
	);
}
