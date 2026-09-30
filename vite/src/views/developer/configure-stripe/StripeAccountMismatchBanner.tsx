import { Alert, AlertAction, AlertDescription, AlertTitle } from "@autumn/ui";
import { WarningIcon, XIcon } from "@phosphor-icons/react";

export const StripeAccountMismatchBanner = ({
	message,
	onDismiss,
}: {
	message: string;
	onDismiss: () => void;
}) => {
	return (
		<Alert variant="warning">
			<WarningIcon weight="fill" />
			<AlertTitle>Stripe accounts don't match</AlertTitle>
			<AlertDescription>{message}</AlertDescription>
			<AlertAction>
				<button
					type="button"
					onClick={onDismiss}
					aria-label="Dismiss warning"
					className="rounded p-0.5 hover:bg-amber-500/15"
				>
					<XIcon className="size-4" />
				</button>
			</AlertAction>
		</Alert>
	);
};
