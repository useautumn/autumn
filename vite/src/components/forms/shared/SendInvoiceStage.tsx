import type { AppEnv } from "@autumn/shared";
import {
	ArrowLeft,
	CheckCircleIcon,
	HourglassIcon,
	LightningIcon,
} from "@phosphor-icons/react";
import { format } from "date-fns";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import { PanelButton } from "@/components/v2/buttons/PanelButton";
import { Input } from "@/components/v2/inputs/Input";
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

export interface SendInvoiceSubmitParams {
	enableProductImmediately: boolean;
	finalizeInvoice: boolean;
}

export function PlanActivationSection({
	enableImmediately,
	setEnableImmediately,
	disabled,
}: {
	enableImmediately: boolean;
	setEnableImmediately: (value: boolean) => void;
	disabled?: boolean;
}) {
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
							Enable plan immediately
						</div>
						<div className="text-body-secondary leading-tight">
							Plan activates now, payment is collected separately.
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
							Enable plan after payment
						</div>
						<div className="text-body-secondary leading-tight">
							Plan activates only after the customer completes payment.
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
}) {
	const { customer, refetch } = useCusQuery();
	const axiosInstance = useAxiosInstance();

	const [emailValue, setEmailValue] = useState("");
	const [emailSaving, setEmailSaving] = useState(false);
	const [emailSaved, setEmailSaved] = useState(!!customer?.email);
	const [enableImmediately, setEnableImmediately] = useState(true);
	const [completedInvoiceUrl, setCompletedInvoiceUrl] = useState<string | null>(
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

	const handleDraft = async () => {
		setActiveAction("draft");
		try {
			const { stripeId } = await onSubmit({
				enableProductImmediately: enableImmediately,
				finalizeInvoice: false,
			});
			if (stripeId) {
				window.open(getInvoiceUrl(stripeId), "_blank");
			}
		} finally {
			setActiveAction(null);
		}
	};

	const handleFinalize = async () => {
		setActiveAction("finalize");
		try {
			const { hostedInvoiceUrl, stripeId } = await onSubmit({
				enableProductImmediately: enableImmediately,
				finalizeInvoice: true,
			});
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

	if (completedInvoiceUrl) {
		return (
			<>
				<SheetHeader
					title="Invoice Sent"
					description={
						productName
							? `Invoice for ${productName} has been finalized and sent`
							: "Invoice has been finalized and sent"
					}
					noSeparator
				/>

				<SheetSection withSeparator={false}>
					<div className="flex flex-col items-center gap-2 pt-4">
						<div className="size-10 rounded-full bg-green-500/10 flex items-center justify-center">
							<CheckCircleIcon
								size={24}
								weight="duotone"
								className="text-green-500"
							/>
						</div>
						<p className="text-sm text-t2 text-center">
							The invoice has been finalized and sent to the customer.
						</p>
					</div>
				</SheetSection>

				<SheetFooter className="flex flex-col grid-cols-1 mt-0">
					<Button
						variant="primary"
						className="w-full"
						onClick={() => window.open(completedInvoiceUrl, "_blank")}
					>
						View Stripe invoice
					</Button>
					<CopyButton
						text={completedInvoiceUrl}
						innerClassName="text-xs text-t3 font-mono w-96"
					/>
				</SheetFooter>
			</>
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
					className="flex items-center gap-1 text-t3 text-sm cursor-pointer mt-2 hover:text-foreground transition-colors"
				>
					<ArrowLeft size={14} />
					Back
				</button>
			</SheetHeader>

			{needsEmail && (
				<SheetSection title="Customer Email" withSeparator>
					<p className="text-t3 text-sm mb-3">
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
}: {
	productName?: string;
	previewQuery: {
		data?:
			| {
					total: number;
					next_cycle?: { total: number; starts_at?: number };
					line_items: BillingLineItem[];
					currency?: string;
			  }
			| null
			| undefined;
	};
	isPending: boolean;
	onSubmit: (params: SendInvoiceSubmitParams) => Promise<{
		stripeId: string | undefined;
		hostedInvoiceUrl: string | null | undefined;
	}>;
	stripeAccount: { id?: string } | undefined;
	env: AppEnv;
	onBack: () => void;
}) {
	const previewData = previewQuery.data;

	const totals = useMemo(() => {
		const result: {
			label: string;
			amount: number;
			variant: "primary" | "secondary";
			badge?: string;
		}[] = [];
		if (!previewData) return result;

		result.push({
			label: "Total Due Now",
			amount: Math.max(previewData.total, 0),
			variant: "primary",
		});

		if (previewData.next_cycle) {
			result.push({
				label: "Next Cycle",
				amount: previewData.next_cycle.total,
				variant: "secondary",
				badge: previewData.next_cycle.starts_at
					? format(new Date(previewData.next_cycle.starts_at), "MMM d, yyyy")
					: undefined,
			});
		}
		return result;
	}, [previewData]);

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
		/>
	);
}
