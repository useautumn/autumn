import type { SetPlansPreviewWarning } from "@autumn/shared";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	ShortcutButton,
} from "@autumn/ui";
import { SetPlansTextLine } from "@/components/forms/shared/errors/SetPlansTextLine";

export function BackdateRecreateConfirmDialog({
	warning,
	open,
	isPending,
	onOpenChange,
	onConfirm,
}: {
	warning: SetPlansPreviewWarning;
	open: boolean;
	isPending: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Recreate the subscription?</DialogTitle>
					<DialogDescription>
						<SetPlansTextLine
							parts={warning.parts ?? [{ text: warning.message }]}
						/>
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<ShortcutButton
						disabled={isPending}
						onClick={() => onOpenChange(false)}
						singleShortcut="escape"
						variant="secondary"
					>
						Cancel
					</ShortcutButton>
					<ShortcutButton
						disabled={isPending}
						isLoading={isPending}
						metaShortcut="enter"
						onClick={onConfirm}
					>
						Recreate
					</ShortcutButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
