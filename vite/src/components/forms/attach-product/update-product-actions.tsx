import type { CheckoutResponseV0, ProductV2 } from "@autumn/shared";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRightFromSquare, CircleCheck } from "lucide-react";
import { useAttachProductMutation } from "@/components/forms/attach-product/use-attach-product-mutation";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/v2/buttons/Button";
import { useOrg } from "@/hooks/common/useOrg";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useEnv } from "@/utils/envUtils";
import { getStripeInvoiceLink } from "@/utils/linkUtils";
import type { UseAttachProductForm } from "./use-attach-product-form";

function getUpdateButtonConfig(isCheckout: boolean): {
	text: string;
	icon: LucideIcon;
} {
	return isCheckout
		? { text: "Checkout", icon: ArrowUpRightFromSquare }
		: { text: "Confirm Update", icon: CircleCheck };
}

interface UpdateProductActionsProps {
	product?: ProductV2;
	customerId?: string;
	entityId?: string;
	onSuccess?: () => void;
	previewData?: CheckoutResponseV0 | null;
	isPreviewLoading?: boolean;
	version?: number;
	form: UseAttachProductForm;
}

export function UpdateProductActions({
	form,
	product,
	customerId,
	entityId,
	onSuccess,
	previewData,
	isPreviewLoading,
	version,
}: UpdateProductActionsProps) {
	const { stripeAccount } = useOrgStripeQuery();
	const env = useEnv();
	const org = useOrg();

	const isOwnStripeAccount = stripeAccount?.id === org.org?.stripe_connection;
	const attachMutation = useAttachProductMutation({
		customerId: customerId ?? "",
		successMessage: "Plan updated successfully",
		onSuccess: () => {
			onSuccess?.();
		},
	});

	const handleUpdate = async ({
		useInvoice,
		enableProductImmediately,
	}: {
		useInvoice: boolean;
		enableProductImmediately?: boolean;
	}) => {
		if (previewData?.url) {
			window.open(previewData.url, "_blank");
			return;
		}

		// Does the update
		const result = await attachMutation.mutateAsync({
			product,
			entityId,
			useInvoice,
			enableProductImmediately,
			prepaidOptions: form.state.values.prepaidOptions ?? undefined,
			version,
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
		}
	};

	const isLoading = attachMutation.isPending;

	// Don't show buttons if preview is loading
	if (isPreviewLoading || !product) {
		return null;
	}

	const isCheckout = !!previewData?.url;
	const { text: updateText, icon: UpdateIcon } =
		getUpdateButtonConfig(isCheckout);

	return (
		<div className="flex flex-col px-4 mt-2">
			<Popover>
				<PopoverTrigger asChild>
					<Button
						variant="secondary"
						className="w-full"
						isLoading={isLoading}
						disabled={isLoading}
						type="button"
					>
						Send an Invoice
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-80 p-0" align="start">
					<div className="flex flex-col">
						<button
							type="button"
							onClick={() =>
								handleUpdate({
									useInvoice: true,
									enableProductImmediately: true,
								})
							}
							className="px-4 py-3 text-left text-sm hover:bg-accent"
						>
							<div className="font-medium">Enable plan immediately</div>
							<div className="text-xs text-muted-foreground">
								Enable the plan immediately and redirect to Stripe to finalize
								the invoice
							</div>
						</button>
						<button
							type="button"
							onClick={() =>
								handleUpdate({
									useInvoice: true,
									enableProductImmediately: false,
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
				className="w-full flex items-center gap-2 mt-2"
				isLoading={isLoading}
				disabled={isLoading}
				onClick={() =>
					handleUpdate({
						useInvoice: false,
					})
				}
			>
				{updateText}
				<UpdateIcon className="size-3.5" />
			</Button>
		</div>
	);
}
