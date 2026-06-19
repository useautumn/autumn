import type { CustomButton } from "@autumn/shared";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";

export const DeleteCustomButtonDialog = ({
	button,
	open,
	onOpenChange,
	onConfirm,
	isDeleting,
}: {
	button: CustomButton | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	isDeleting: boolean;
}) => {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle className="truncate">Delete {button?.label}</DialogTitle>
					<DialogDescription>
						Are you sure you want to delete this button? This action cannot be
						undone.
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
