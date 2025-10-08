import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";

interface NavigationBlockerDialogProps {
	isOpen: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}

export const NavigationBlockerDialog = ({
	isOpen,
	onConfirm,
	onCancel,
}: NavigationBlockerDialogProps) => {
	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
			<DialogContent showCloseButton={false} className="max-w-md">
				<DialogHeader>
					<DialogTitle>Unsaved Changes</DialogTitle>
					<DialogDescription>
						Are you sure you want to leave without updating the product? Your
						changes will be lost.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter className="gap-2">
					<Button variant="secondary" onClick={onCancel}>
						Cancel
					</Button>
					<Button variant="destructive" onClick={onConfirm}>
						Leave Page
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
