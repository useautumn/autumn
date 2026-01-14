import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/v2/buttons/Button";
import { SheetFooter } from "@/components/v2/sheets/SharedSheetComponents";

interface UpdateSubscriptionFooterProps {
	isPending: boolean;
	onConfirm: () => void;
	onInvoiceUpdate: (params: { enableProductImmediately: boolean }) => void;
}

export function UpdateSubscriptionFooter({
	isPending,
	onConfirm,
	onInvoiceUpdate,
}: UpdateSubscriptionFooterProps) {
	return (
		<SheetFooter className="flex flex-col grid-cols-1 mt-0">
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
								onInvoiceUpdate({ enableProductImmediately: true })
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
								onInvoiceUpdate({ enableProductImmediately: false })
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
				onClick={onConfirm}
				isLoading={isPending}
			>
				Confirm Update
			</Button>
		</SheetFooter>
	);
}
