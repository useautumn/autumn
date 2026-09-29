import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@autumn/ui";
import type { ByocCacheRemovalDisplay } from "./byocCacheStatusDisplay";

export const DeleteByocCacheDialog = ({
	removal,
	open,
	onOpenChange,
	onConfirm,
	isDeleting,
}: {
	removal: ByocCacheRemovalDisplay;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	isDeleting: boolean;
}) => (
	<Dialog open={open} onOpenChange={onOpenChange}>
		<DialogContent className="max-w-md">
			<DialogHeader>
				<DialogTitle>{removal.action}</DialogTitle>
				<DialogDescription>{removal.description}</DialogDescription>
			</DialogHeader>
			<DialogFooter>
				<Button
					variant="secondary"
					onClick={() => onOpenChange(false)}
					disabled={isDeleting}
				>
					Keep it
				</Button>
				<Button
					variant="destructive"
					onClick={onConfirm}
					isLoading={isDeleting}
				>
					{removal.action}
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
);
