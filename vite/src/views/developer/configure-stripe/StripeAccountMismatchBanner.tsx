import { WarningIcon, XIcon } from "@phosphor-icons/react";

export const StripeAccountMismatchBanner = ({
	message,
	onDismiss,
}: {
	message: string;
	onDismiss: () => void;
}) => {
	return (
		<div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-amber-600 dark:text-amber-500">
			<WarningIcon className="mt-0.5 h-4 w-4 shrink-0" weight="fill" />
			<div className="flex flex-col gap-0.5 text-sm">
				<span className="font-medium">Stripe accounts don't match</span>
				<span>{message}</span>
			</div>
			<button
				type="button"
				onClick={onDismiss}
				aria-label="Dismiss warning"
				className="-mr-1 ml-auto shrink-0 rounded p-0.5 hover:bg-amber-500/15"
			>
				<XIcon className="h-4 w-4" />
			</button>
		</div>
	);
};
