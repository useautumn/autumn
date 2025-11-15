import { ArrowUpRightFromSquare } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/v2/buttons/Button";
import { useOrgStripeQuery } from "@/hooks/queries/useOrgStripeQuery";
import { CusService } from "@/services/customers/CusService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
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
	const [attachLoading, setAttachLoading] = useState(false);
	const [invoiceLoading, setInvoiceLoading] = useState(false);
	const axiosInstance = useAxiosInstance();
	const { stripeAccount } = useOrgStripeQuery();
	const env = useEnv();

	const handleAttach = async ({
		useInvoice,
		enableProductImmediately,
		setLoading,
	}: {
		useInvoice: boolean;
		enableProductImmediately?: boolean;
		setLoading: (loading: boolean) => void;
	}) => {
		const formValues = form.state.values.products;
		const prepaidOptions: { feature_id: string; quantity: number }[] =
			form.state.values.prepaidOptions || [];
		const validProducts = formValues.filter((p) => p.productId);

		if (validProducts.length === 0) {
			toast.error("Please select at least one product");
			return;
		}

		setLoading(true);

		try {
			const attachPromises = validProducts.map(async (item) => {
				const attachBody = {
					customer_id: customerId,
					product_id: item.productId,
					options:
						prepaidOptions.length > 0
							? prepaidOptions.map((opt) => ({
									feature_id: opt.feature_id,
									quantity: opt.quantity,
								}))
							: undefined,
					invoice: useInvoice,
					enable_product_immediately: useInvoice
						? enableProductImmediately
						: undefined,
					finalize_invoice: useInvoice ? false : undefined,
					success_url: window.location.href,
				};

				return await CusService.attach(axiosInstance, attachBody);
			});

			const results = await Promise.all(attachPromises);

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

			toast.success(`Successfully attached ${validProducts.length} product(s)`);
			form.reset();
			onSuccess?.();
		} catch (error) {
			toast.error("Failed to attach products");
			console.error(error);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="flex flex-col gap-2">
			<Popover>
				<PopoverTrigger asChild>
					<Button
						variant="secondary"
						className="w-full"
						isLoading={invoiceLoading}
						disabled={attachLoading || invoiceLoading}
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
									setLoading: setInvoiceLoading,
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
									setLoading: setInvoiceLoading,
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
				isLoading={attachLoading}
				disabled={attachLoading || invoiceLoading}
				onClick={() =>
					handleAttach({
						useInvoice: false,
						setLoading: setAttachLoading,
					})
				}
			>
				Attach products
				<ArrowUpRightFromSquare className="size-3.5" />
			</Button>
		</div>
	);
}
