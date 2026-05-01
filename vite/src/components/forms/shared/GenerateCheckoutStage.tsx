import { ArrowLeft, CheckCircleIcon, LinkIcon } from "@phosphor-icons/react";
import { format } from "date-fns";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { CopyButton } from "@/components/v2/buttons/CopyButton";
import type { BillingLineItem } from "@/components/v2/LineItemsPreview";
import { LineItemsPreview } from "@/components/v2/LineItemsPreview";
import {
	SheetFooter,
	SheetHeader,
	SheetSection,
} from "@/components/v2/sheets/SharedSheetComponents";
import { PlanActivationSection } from "./SendInvoiceStage";

export interface GenerateCheckoutSubmitParams {
	enablePlanImmediately: boolean;
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
	onSubmit: (params: GenerateCheckoutSubmitParams) => Promise<{
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
	const [enableImmediately, setEnableImmediately] = useState(true);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [completedCheckoutUrl, setCompletedCheckoutUrl] = useState<
		string | null
	>(null);

	const handleGenerate = async () => {
		setIsSubmitting(true);
		try {
			const { paymentUrl } = await onSubmit({
				enablePlanImmediately: enableImmediately,
			});
			if (paymentUrl) {
				setCompletedCheckoutUrl(paymentUrl);
				navigator.clipboard.writeText(paymentUrl);
				toast.success("Checkout URL copied to clipboard");
			}
		} finally {
			setIsSubmitting(false);
		}
	};

	if (completedCheckoutUrl) {
		return (
			<>
				<SheetHeader
					title="Checkout URL Generated"
					description={
						productName
							? `Checkout session created for ${productName}`
							: "Checkout session has been created"
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
							The checkout URL has been generated and copied to your clipboard.
						</p>
					</div>
				</SheetSection>

				<SheetFooter className="flex flex-col grid-cols-1 mt-0">
					<Button
						variant="primary"
						className="w-full"
						onClick={() => window.open(completedCheckoutUrl, "_blank")}
					>
						Open checkout URL
					</Button>
					<CopyButton
						text={completedCheckoutUrl}
						innerClassName="text-xs text-t3 font-mono w-96"
					/>
				</SheetFooter>
			</>
		);
	}

	return (
		<>
			<SheetHeader
				title="Generate Checkout"
				description={
					productName
						? `Create a checkout session for ${productName}`
						: "Configure checkout session"
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

			<PlanActivationSection
				enableImmediately={enableImmediately}
				setEnableImmediately={setEnableImmediately}
			/>

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
					onClick={handleGenerate}
					isLoading={isSubmitting}
					disabled={isPending}
				>
					<LinkIcon size={16} weight="bold" />
					Generate Checkout URL
				</Button>
			</SheetFooter>
		</>
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
	onSubmit: (params: GenerateCheckoutSubmitParams) => Promise<{
		paymentUrl: string | null | undefined;
	}>;
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
