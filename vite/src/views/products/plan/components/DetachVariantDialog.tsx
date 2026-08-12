import type { ProductV2 } from "@autumn/shared";
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@autumn/ui";

interface DetachVariantDialogProps {
	open: boolean;
	setOpen: (open: boolean) => void;
	product: ProductV2;
	isLoading: boolean;
	onDetach: () => void;
}

export function DetachVariantDialog({
	open,
	setOpen,
	product,
	isLoading,
	onDetach,
}: DetachVariantDialogProps) {
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Detach from base</DialogTitle>
					<DialogDescription>
						{product.name} will become a standalone plan and stop inheriting
						changes from its base plan.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="secondary" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button variant="primary" onClick={onDetach} isLoading={isLoading}>
						Detach
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
