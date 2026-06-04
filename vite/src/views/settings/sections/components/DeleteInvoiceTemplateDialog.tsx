import type { InvoiceTemplate } from "@autumn/shared";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";

export const DeleteInvoiceTemplateDialog = ({
	template,
	open,
	onOpenChange,
	onConfirm,
	isDeleting,
}: {
	template: InvoiceTemplate | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	isDeleting: boolean;
}) => {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle className="truncate">
						Delete {template?.name}
					</DialogTitle>
					<DialogDescription>
						Are you sure you want to delete this invoice template? This action
						cannot be undone.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						variant="secondary"
						onClick={() => onOpenChange(false)}
						disabled={isDeleting}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={onConfirm}
						isLoading={isDeleting}
					>
						Delete
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
