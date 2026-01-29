import { motion } from "motion/react";
import { useEffect, useState } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/v2/buttons/Button";
import { SheetFooter } from "@/components/v2/sheets/SharedSheetComponents";
import { useAttachFormContext } from "../context/AttachFormProvider";

const FOOTER_DELAY_MS = 350;

export function AttachFooter() {
	const {
		isPending,
		previewQuery,
		handleConfirm,
		handleInvoiceAttach,
		formValues,
	} = useAttachFormContext();

	const hasProductSelected = !!formValues.productId;
	const isLoading = previewQuery.isLoading;
	const hasError = !!previewQuery.error;
	const isReady = hasProductSelected && !isLoading && !hasError;

	const [showFooter, setShowFooter] = useState(false);

	useEffect(() => {
		if (isReady) {
			const timer = setTimeout(() => setShowFooter(true), FOOTER_DELAY_MS);
			return () => clearTimeout(timer);
		}
		setShowFooter(false);
	}, [isReady]);

	if (!showFooter) return null;

	return (
		<SheetFooter className="flex flex-col grid-cols-1 mt-0">
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.2 }}
				className="flex flex-col gap-2 w-full"
			>
				<Popover>
					<PopoverTrigger asChild>
						<Button variant="secondary" className="w-full" disabled={isPending}>
							Send an Invoice
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-(--radix-popover-trigger-width) p-0">
						<div className="flex flex-col">
							<button
								type="button"
								onClick={() =>
									handleInvoiceAttach({ enableProductImmediately: true })
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
									handleInvoiceAttach({ enableProductImmediately: false })
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
					className="w-full"
					onClick={handleConfirm}
					isLoading={isPending}
				>
					Attach Product
				</Button>
			</motion.div>
		</SheetFooter>
	);
}
