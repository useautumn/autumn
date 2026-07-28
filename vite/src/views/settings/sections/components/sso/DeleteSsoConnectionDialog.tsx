import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@autumn/ui";

export const DeleteSsoConnectionDialog = ({
	domain,
	open,
	onOpenChange,
	onConfirm,
	isDeleting,
}: {
	domain: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	isDeleting: boolean;
}) => (
	<Dialog open={open} onOpenChange={onOpenChange}>
		<DialogContent className="max-w-md">
			<DialogHeader>
				<DialogTitle>Delete SSO connection</DialogTitle>
				<DialogDescription className="break-words">
					Members with an <span className="font-medium">@{domain}</span> email
					will sign in with an email code again, and this connection's client
					credentials are removed. You can set SSO up again at any time.
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
					Delete connection
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
);
