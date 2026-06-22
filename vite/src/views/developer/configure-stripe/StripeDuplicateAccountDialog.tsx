import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";

export const StripeDuplicateAccountDialog = ({
	open,
	onClose,
	accountId,
	accountName,
	connectedOrgName,
	connectedOrgSlug,
}: {
	open: boolean;
	onClose: () => void;
	accountId: string | null;
	accountName: string | null;
	connectedOrgName: string | null;
	connectedOrgSlug: string | null;
}) => {
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Account Already Connected</DialogTitle>
					<DialogDescription>
						The Stripe account <strong>{accountId}</strong>
						{accountName && <> ({accountName})</>} is already connected to the
						Autumn organization <strong>{connectedOrgName}</strong>
						{connectedOrgSlug && <> ({connectedOrgSlug})</>}. Please disconnect
						it from there first before connecting to this organization.
					</DialogDescription>
				</DialogHeader>
				<Button onClick={onClose}>OK</Button>
			</DialogContent>
		</Dialog>
	);
};
