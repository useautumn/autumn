import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	ShortcutButton,
} from "@autumn/ui";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";

export function FeatureStripeProductConfirmDialog({
	open,
	isSaving,
	confirmLabel,
	onOpenChange,
	onConfirm,
}: {
	open: boolean;
	isSaving: boolean;
	confirmLabel: string;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Save Stripe product?</DialogTitle>
					<DialogDescription>
						Confirm this Stripe product before Autumn updates the feature.
					</DialogDescription>
				</DialogHeader>

				<InfoBox variant="warning">
					Existing customers' Stripe state is unchanged; this Stripe product is
					used for new usage prices going forward.
				</InfoBox>

				<DialogFooter>
					<ShortcutButton
						disabled={isSaving}
						onClick={() => onOpenChange(false)}
						singleShortcut="escape"
						variant="secondary"
					>
						Cancel
					</ShortcutButton>
					<ShortcutButton
						disabled={isSaving}
						isLoading={isSaving}
						metaShortcut="enter"
						onClick={onConfirm}
					>
						{confirmLabel}
					</ShortcutButton>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
