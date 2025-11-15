import { ArrowUpRightFromSquare } from "lucide-react";
import { toast } from "sonner";
import { useAttachProductMutation } from "@/components/forms/attach-product/use-attach-product-mutation";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/v2/buttons/Button";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { useEnv } from "@/utils/envUtils";
import { getStripeInvoiceLink } from "@/utils/linkUtils";
import type { UseAttachProductForm } from "./use-attach-product-form";

interface AttachProductActionsProps {
	form: UseAttachProductForm;
	customerId: string;
	onSuccess?: () => void;
}

export function AttachProductActions({
	form,
	customerId,
	onSuccess,
}: AttachProductActionsProps) {
	const { stripeAccount } = useOrgStripeQuery();
	const env = useEnv();

	const attachMutation = useAttachProductMutation({
		customerId,
		onSuccess: () => {
			form.reset();
			onSuccess?.();
		},
	});

	const handleAttach = async ({
		useInvoice,
		enableProductImmediately,
	}: {
		useInvoice: boolean;
		enableProductImmediately?: boolean;
	}) => {
		const formValues = form.state.values.products;
		const prepaidOptions = form.state.values.prepaidOptions || [];
		const validProducts = formValues.filter((p) => p.productId);

		if (validProducts.length === 0) {
			toast.error("Please select at least one product");
			return;
		}

		const results = await attachMutation.mutateAsync({
			products: validProducts,
			prepaidOptions,
			useInvoice,
			enableProductImmediately,
		});

		// Handle checkout URLs and invoice links
		for (const result of results) {
			if (result.data.checkout_url) {
				window.open(result.data.checkout_url, "_blank");
			} else if (result.data.invoice) {
				window.open(
					getStripeInvoiceLink({
						stripeInvoice: result.data.invoice,
						env,
						accountId: stripeAccount?.id,
					}),
					"_blank",
				);
			}
		}
	};

	const isLoading = attachMutation.isPending;

	return (
		<div className="flex flex-col gap-2">
			<Popover>
				<PopoverTrigger asChild>
					<Button
						variant="secondary"
						className="w-full"
						isLoading={isLoading}
						disabled={isLoading}
						type="button"
					>
						Invoice Customer
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-80 p-0" align="start">
					<div className="flex flex-col">
						<button
							type="button"
							onClick={() =>
								handleAttach({
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
								handleAttach({
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
				className="w-full flex items-center gap-2"
				isLoading={isLoading}
				disabled={isLoading}
				onClick={() =>
					handleAttach({
						useInvoice: false,
					})
				}
			>
				Attach products
				<ArrowUpRightFromSquare className="size-3.5" />
			</Button>
		</div>
	);
}
