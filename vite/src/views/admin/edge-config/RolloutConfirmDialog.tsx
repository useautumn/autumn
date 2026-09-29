import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@autumn/ui";

export const RolloutConfirmDialog = ({
	open,
	onOpenChange,
	title,
	description,
	confirmLabel,
	onConfirm,
	isPending,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: string;
	confirmLabel: string;
	onConfirm: () => void;
	isPending: boolean;
}) => (
	<Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
		<DialogContent className="w-[420px]">
			<DialogHeader>
				<DialogTitle>{title}</DialogTitle>
				<DialogDescription>{description}</DialogDescription>
			</DialogHeader>
			<DialogFooter>
				<Button
					variant="secondary"
					onClick={() => onOpenChange(false)}
					disabled={isPending}
				>
					Cancel
				</Button>
				<Button variant="primary" onClick={onConfirm} isLoading={isPending}>
					{confirmLabel}
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
);
