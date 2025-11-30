import type { CheckoutResponseV0, ProductV2 } from "@autumn/shared";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRightFromSquare, CircleCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAttachProductMutation } from "@/components/forms/attach-product/use-attach-product-mutation";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/v2/buttons/Button";
import { useOrg } from "@/hooks/common/useOrg";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import { useEnv } from "@/utils/envUtils";
import { getStripeInvoiceLink } from "@/utils/linkUtils";
import type { UseAttachProductForm } from "./use-attach-product-form";

function getAttachButtonConfig(isCheckout: boolean): {
	text: string;
	icon: LucideIcon;
} {
	return isCheckout
		? { text: "Checkout", icon: ArrowUpRightFromSquare }
		: { text: "Confirm", icon: CircleCheck };
}

interface AttachProductActionsProps {
	form: UseAttachProductForm;
	product: ProductV2;
	customerId: string;
	onSuccess?: () => void;
	previewData?: CheckoutResponseV0 | null;
	isPreviewLoading?: boolean;
}

export function AttachProductActions({
	form,
	product,
	customerId,
	onSuccess,
	previewData,
	isPreviewLoading,
}: AttachProductActionsProps) {
	const { stripeAccount } = useOrgStripeQuery();
	const env = useEnv();
	const org = useOrg();
	const { entityId } = useEntity();
	const [activeAction, setActiveAction] = useState<"invoice" | "attach" | null>(
		null,
	);
	const { closeSheet } = useSheetStore();

	const ownStripeAccount = org.org?.stripe_connection !== "default";

	const attachMutation = useAttachProductMutation({
		customerId,
		onSuccess: () => {
			form.reset();
			setActiveAction(null);
			onSuccess?.();
		},
	});

	const handleAttach = async ({
		useInvoice,
		enableProductImmediately,
		action,
	}: {
		useInvoice: boolean;
		enableProductImmediately?: boolean;
		action: "invoice" | "attach";
	}) => {
		const { prepaidOptions } = form.state.values;
		setActiveAction(action);

		if (previewData?.url && action === "attach") {
			window.open(previewData.url, "_blank");
			setActiveAction(null);
			closeSheet();
			return;
		}

		try {
			//does the attach
			const result = await attachMutation.mutateAsync({
				product,
				prepaidOptions: prepaidOptions || {},
				useInvoice,
				enableProductImmediately,
				entityId: entityId ?? undefined,
			});

			// Handle checkout URLs and invoice links
			if (result.data.invoice) {
				window.open(
					getStripeInvoiceLink({
						stripeInvoice: result.data.invoice,
						env,
						accountId: stripeAccount?.id,
					}),
					"_blank",
				);
				toast.success("Redirected to Stripe to finalize the invoice");
			}
		} catch (error) {
			setActiveAction(null);
			throw error;
		}
	};

	const isLoading = attachMutation.isPending;
	const isInvoiceLoading = isLoading && activeAction === "invoice";
	const isAttachLoading = isLoading && activeAction === "attach";

	// Don't show buttons if preview is loading
	if (isPreviewLoading || !product) {
		return null;
	}

	const isCheckout = !!previewData?.url;
	const { text: attachText, icon: AttachIcon } =
		getAttachButtonConfig(isCheckout);

	return (
		<div className="flex flex-col gap-2 px-4">
			<Popover>
				<PopoverTrigger asChild>
					<Button
						variant="secondary"
						className="w-full"
						isLoading={isInvoiceLoading}
						disabled={isLoading || !ownStripeAccount}
						type="button"
					>
						Send an Invoice
					</Button>
				</PopoverTrigger>
				<PopoverContent
					className="p-0 z-100 rounded-lg w-[--radix-popover-trigger-width]"
					align="start"
				>
					<div className="flex flex-col">
						<button
							type="button"
							disabled={isLoading}
							onClick={() =>
								handleAttach({
									useInvoice: true,
									enableProductImmediately: true,
									action: "invoice",
								})
							}
							className="px-4 py-3 text-left text-sm hover:bg-accent"
						>
							<div className="font-medium">Enable plan immediately</div>
							<div className="text-xs text-muted-foreground">
								Enable the plan immediately and redirect to Stripe to finalize
								the invoice. Customer can pay by the invoice due date.
							</div>
						</button>
						<button
							type="button"
							disabled={isLoading}
							onClick={() =>
								handleAttach({
									useInvoice: true,
									enableProductImmediately: false,
									action: "invoice",
								})
							}
							className="px-4 py-3 text-left text-sm hover:bg-accent border-t"
						>
							<div className="font-medium">Enable plan after payment</div>
							<div className="text-xs text-muted-foreground">
								Generate an invoice link for the customer. The plan will be
								enabled after they pay the invoice
							</div>
						</button>
					</div>
				</PopoverContent>
			</Popover>

			<Button
				variant="primary"
				className="w-full flex items-center gap-2"
				isLoading={isAttachLoading}
				disabled={isLoading}
				onClick={() =>
					handleAttach({
						useInvoice: false,
						action: "attach",
					})
				}
			>
				{attachText}
				<AttachIcon className="size-3.5" />
			</Button>
		</div>
	);
}
