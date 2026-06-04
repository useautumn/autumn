import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";

interface RevenueCatDisconnectDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	env: string;
	onConfirm: () => void;
	isLoading: boolean;
}

export const RevenueCatDisconnectDialog = ({
	open,
	onOpenChange,
	env,
	onConfirm,
	isLoading,
}: RevenueCatDisconnectDialogProps) => {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Disconnect RevenueCat?</DialogTitle>
					<DialogDescription>
						This removes the {env} RevenueCat connection. Autumn will stop
						receiving purchase events until you reconnect. Your products and
						mappings are kept.
					</DialogDescription>
				</DialogHeader>
				<div className="flex gap-2 justify-end">
					<Button variant="secondary" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button variant="destructive" onClick={onConfirm} isLoading={isLoading}>
						Disconnect
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
};
