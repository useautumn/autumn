import type { AttachPreviewResponse } from "@autumn/shared";
import {
	ArrowLeft,
	CalendarCheckIcon,
	LinkIcon,
} from "@phosphor-icons/react";
import { useStore } from "@tanstack/react-form";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAttachFormContext } from "@/components/forms/attach-v2";
import {
	buildAttachPreviewTotals,
	getAttachPreviewLineItems,
	getAttachScheduledStartDate,
} from "@/components/forms/attach-v2/utils/buildAttachPreviewTotals";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/v2/buttons/Button";
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

type PreviewData = AttachPreviewResponse | null | undefined;
type GenerateCheckoutSubmitParams = {
	longLivedCheckout?: boolean;
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
}) {
	const { form } = useAttachFormContext();
	const enablePlanImmediately = useStore(
		form.store,
		(state) => state.values.enablePlanImmediately,
	);
	const longLivedCheckout = useStore(
		form.store,
		(state) => state.values.longLivedCheckout,
	);
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
				setEnableImmediately={(value) =>
					form.setFieldValue("enablePlanImmediately", value)
				}
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
									form.setFieldValue("longLivedCheckout", !!enabled)
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
			lineItems={lineItems}
			currency={currency}
			totals={totals}
			buttonLabel="Generate Checkout URL"
			buttonIcon={<LinkIcon size={16} weight="bold" />}
			showLongLivedCheckout
		/>
	);
}

export function GenerateCheckoutStageWithPreview({
	productName,
	previewQuery,
	isPending,
	onSubmit,
	onBack,
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
}) {
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
}: {
	productName?: string;
	startDate: number | null;
	previewQuery: {
		data?: PreviewData;
	};
	isPending: boolean;
	onSubmit: () => void | Promise<void>;
	onBack: () => void;
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
		/>
	);
}
