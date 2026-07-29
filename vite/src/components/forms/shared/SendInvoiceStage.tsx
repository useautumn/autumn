import type { AppEnv, AttachPreviewResponse } from "@autumn/shared";
import { Button, Input, PanelButton } from "@autumn/ui";
import { ArrowLeft, HourglassIcon, LightningIcon } from "@phosphor-icons/react";
import { format } from "date-fns";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { buildAttachPreviewTotals } from "@/components/forms/attach-v2/utils/buildAttachPreviewTotals";
import type { BillingLineItem } from "@/components/v2/LineItemsPreview";
import { LineItemsPreview } from "@/components/v2/LineItemsPreview";
import {
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getStripeInvoiceLink } from "@/utils/linkUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import {
	DEFAULT_NET_TERMS_DAYS,
	type InvoiceSettings,
	InvoiceSettingsSection,
} from "./InvoiceSettingsSection";
import { UrlSuccessView } from "./UrlSuccessView";

export interface SendInvoiceSubmitParams {
	enableProductImmediately: boolean;
	finalizeInvoice: boolean;
	invoiceTemplateId?: string;
	netTermsDays?: number;
}

const IMMEDIATE_ACTIVATION_DESCRIPTION =
	"Plan activates now, payment is collected separately.";

const DEFAULT_ACTIVATION_COPY = {
	immediate: {
		title: "Enable plan immediately",
		description: IMMEDIATE_ACTIVATION_DESCRIPTION,
	},
	delayed: {
		title: "Enable plan after payment",
		description: "Plan activates only after the customer completes payment.",
	},
} as const;

const getScheduledActivationCopy = (scheduledStartDate: number) =>
	({
		immediate: {
			title: "Enable Immediately",
			description: IMMEDIATE_ACTIVATION_DESCRIPTION,
		},
		delayed: {
			title: "Enable at Start Date",
			description: `Plan activates on ${format(new Date(scheduledStartDate), "MMM d, yyyy")}, payment is collected separately.`,
		},
	}) as const;

export function PlanActivationSection({
	enableImmediately,
	setEnableImmediately,
	disabled,
	scheduledStartDate,
}: {
	enableImmediately: boolean;
	setEnableImmediately: (value: boolean) => void;
	disabled?: boolean;
	scheduledStartDate?: number | null;
}) {
	const activationCopy =
		scheduledStartDate != null
			? getScheduledActivationCopy(scheduledStartDate)
			: DEFAULT_ACTIVATION_COPY;

	return (
		<SheetSection
			title="Plan Activation"
			withSeparator
			className={disabled ? "opacity-50 pointer-events-none" : ""}
		>
			<div className="space-y-4">
				<div className="flex w-full items-center gap-4">
					<PanelButton
						isSelected={enableImmediately}
						onClick={() => setEnableImmediately(true)}
						icon={<LightningIcon size={18} weight="duotone" />}
					/>
					<div className="flex-1">
						<div className="text-body-highlight mb-1">
							{activationCopy.immediate.title}
						</div>
						<div className="text-body-secondary leading-tight">
							{activationCopy.immediate.description}
						</div>
					</div>
				</div>

				<div className="flex w-full items-center gap-4">
					<PanelButton
						isSelected={!enableImmediately}
						onClick={() => setEnableImmediately(false)}
						icon={<HourglassIcon size={18} weight="duotone" />}
					/>
					<div className="flex-1">
						<div className="text-body-highlight mb-1">
							{activationCopy.delayed.title}
						</div>
						<div className="text-body-secondary leading-tight">
							{activationCopy.delayed.description}
						</div>
					</div>
				</div>
			</div>
		</SheetSection>
	);
}

export function SendInvoiceStage({
	productName,
	isPending,
	onBack,
	onSubmit,
	getInvoiceUrl,
	lineItems,
	currency,
	totals,
	scheduledStartDate,
}: {
	productName?: string;
	isPending: boolean;
	onBack: () => void;
	onSubmit: (params: SendInvoiceSubmitParams) => Promise<{
		stripeId: string | undefined;
		hostedInvoiceUrl: string | null | undefined;
	}>;
	getInvoiceUrl: (invoiceStripeId: string) => string;
	lineItems?: BillingLineItem[];
	currency?: string;
	totals?: {
		label: string;
		amount: number;
		variant?: "primary" | "secondary";
		badge?: string;
	}[];
	scheduledStartDate?: number | null;
}) {
	const { customer, refetch } = useCusQuery();
	const axiosInstance = useAxiosInstance();

	const [emailValue, setEmailValue] = useState("");
	const [emailSaving, setEmailSaving] = useState(false);
	const [emailSaved, setEmailSaved] = useState(!!customer?.email);
	const [enableImmediately, setEnableImmediately] = useState(true);
	const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings>({
		templateId: null,
		netTermsDays: DEFAULT_NET_TERMS_DAYS,
	});
	const [completedInvoiceUrl, setCompletedInvoiceUrl] = useState<string | null>(
		null,
	);
	const [completedDraftUrl, setCompletedDraftUrl] = useState<string | null>(
		null,
	);
	const [activeAction, setActiveAction] = useState<"draft" | "finalize" | null>(
		null,
	);

	const customerId = customer?.id ?? customer?.internal_id;

	const handleSaveEmail = useCallback(async () => {
		if (!emailValue.trim() || !customerId) return;

		setEmailSaving(true);
		try {
			await axiosInstance.post(`/v1/customers/${customerId}`, {
				email: emailValue.trim(),
			});
			await refetch();
			setEmailSaved(true);
			toast.success("Email saved");
		} catch {
			toast.error("Failed to save email");
		} finally {
			setEmailSaving(false);
		}
	}, [axiosInstance, customerId, emailValue, refetch]);

	const buildSubmitParams = (
		finalizeInvoice: boolean,
	): SendInvoiceSubmitParams => ({
		enableProductImmediately: enableImmediately,
		finalizeInvoice,
		invoiceTemplateId: invoiceSettings.templateId ?? undefined,
		netTermsDays:
			invoiceSettings.netTermsDays > 0
				? invoiceSettings.netTermsDays
				: undefined,
	});

	const handleDraft = async () => {
		setActiveAction("draft");
		try {
			const { stripeId } = await onSubmit(buildSubmitParams(false));
			if (stripeId) {
				const invoiceUrl = getInvoiceUrl(stripeId);
				window.open(invoiceUrl, "_blank");
				setCompletedDraftUrl(invoiceUrl);
			}
		} finally {
			setActiveAction(null);
		}
	};

	const handleFinalize = async () => {
		setActiveAction("finalize");
		try {
			const { hostedInvoiceUrl, stripeId } = await onSubmit(
				buildSubmitParams(true),
			);
			if (hostedInvoiceUrl) {
				setCompletedInvoiceUrl(hostedInvoiceUrl);
			} else if (stripeId) {
				setCompletedInvoiceUrl(getInvoiceUrl(stripeId));
			}
		} finally {
			setActiveAction(null);
		}
	};

	const needsEmail = !customer?.email && !emailSaved;

	if (completedDraftUrl) {
		return (
			<UrlSuccessView
				title="Invoice Drafted"
				description={
					productName
						? `Draft invoice for ${productName} created in Stripe`
						: "Draft invoice created in Stripe"
				}
				message="Stripe should have opened in a new tab. If it was blocked, use the link below."
				buttonLabel="Open in Stripe"
				url={completedDraftUrl}
			/>
		);
	}

	if (completedInvoiceUrl) {
		return (
			<UrlSuccessView
				title="Invoice Sent"
				description={
					productName
						? `Invoice for ${productName} has been finalized and sent`
						: "Invoice has been finalized and sent"
				}
				message="The invoice has been finalized and sent to the customer."
				buttonLabel="View Stripe invoice"
				url={completedInvoiceUrl}
			/>
		);
	}

	return (
		<>
			<SheetHeader
				title="Send Invoice"
				description={
					productName
						? `Send an invoice for ${productName}`
						: "Configure invoice delivery"
				}
			>
				<button
					type="button"
					onClick={onBack}
					className="flex items-center gap-1 text-tertiary-foreground text-sm cursor-pointer mt-2 hover:text-foreground transition-colors"
				>
					<ArrowLeft size={14} />
					Back
				</button>
			</SheetHeader>

			{needsEmail && (
				<SheetSection title="Customer Email" withSeparator>
					<p className="text-tertiary-foreground text-sm mb-3">
						An email address is required to send an invoice. Add one for this
						customer to continue.
					</p>
					<div className="flex gap-2">
						<Input
							type="email"
							placeholder="customer@example.com"
							value={emailValue}
							onChange={(e) => setEmailValue(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") handleSaveEmail();
							}}
							className="flex-1"
						/>
						<Button
							variant="primary"
							onClick={handleSaveEmail}
							isLoading={emailSaving}
							disabled={!emailValue.trim()}
						>
							Save
						</Button>
					</div>
				</SheetSection>
			)}

			<PlanActivationSection
				enableImmediately={enableImmediately}
				setEnableImmediately={setEnableImmediately}
				disabled={needsEmail}
				scheduledStartDate={scheduledStartDate}
			/>

			<InvoiceSettingsSection
				value={invoiceSettings}
				onChange={setInvoiceSettings}
				disabled={needsEmail}
			/>

			<LineItemsPreview
				title="Pricing Preview"
				lineItems={lineItems}
				currency={currency}
				totals={totals}
				filterZeroAmounts
			/>

			<SheetFooter className="flex flex-col grid-cols-1 mt-0">
				<div className="flex flex-col gap-2 w-full">
					<Button
						variant="secondary"
						className="w-full"
						onClick={handleDraft}
						isLoading={activeAction === "draft"}
						disabled={needsEmail || isPending}
					>
						Draft and edit in Stripe
					</Button>
					<Button
						variant="primary"
						className="w-full"
						onClick={handleFinalize}
						isLoading={activeAction === "finalize"}
						disabled={needsEmail || isPending}
					>
						Finalize and send invoice
					</Button>
				</div>
			</SheetFooter>
		</>
	);
}

export function SendInvoiceStageWithPreview({
	productName,
	previewQuery,
	isPending,
	onSubmit,
	stripeAccount,
	env,
	onBack,
	scheduledStartDate,
}: {
	productName?: string;
	previewQuery: {
		data?: AttachPreviewResponse | null | undefined;
	};
	isPending: boolean;
	onSubmit: (params: SendInvoiceSubmitParams) => Promise<{
		stripeId: string | undefined;
		hostedInvoiceUrl: string | null | undefined;
	}>;
	stripeAccount: { id?: string } | undefined;
	env: AppEnv;
	onBack: () => void;
	scheduledStartDate?: number | null;
}) {
	const previewData = previewQuery.data;
	const effectiveScheduledStartDate = scheduledStartDate ?? null;

	const totals = useMemo(
		() => buildAttachPreviewTotals({ previewData, startDate: null }),
		[previewData],
	);

	const getInvoiceUrl = useCallback(
		(invoiceStripeId: string) =>
			getStripeInvoiceLink({
				stripeInvoice: invoiceStripeId,
				env,
				accountId: stripeAccount?.id,
			}),
		[env, stripeAccount?.id],
	);

	return (
		<SendInvoiceStage
			productName={productName}
			isPending={isPending}
			onBack={onBack}
			onSubmit={onSubmit}
			getInvoiceUrl={getInvoiceUrl}
			lineItems={previewData?.line_items}
			currency={previewData?.currency}
			totals={totals}
			scheduledStartDate={effectiveScheduledStartDate}
		/>
	);
}
