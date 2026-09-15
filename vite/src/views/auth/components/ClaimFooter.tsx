import { cn } from "@autumn/ui/lib/utils";

const layerClass =
	"absolute inset-0 text-center text-xs leading-4 transition-opacity duration-200 ease-out motion-reduce:transition-none";

export const ClaimFooter = ({
	email,
	hasError,
	isBusy,
	onSwitchAccount,
}: {
	email: string;
	hasError: boolean;
	isBusy: boolean;
	onSwitchAccount: () => void;
}) => (
	<div className="relative h-4" aria-live="polite">
		<p
			className={cn(
				layerClass,
				"text-muted-foreground",
				hasError && "pointer-events-none opacity-0",
			)}
			aria-hidden={hasError}
		>
			Claiming as <span className="text-foreground/80">{email}</span>
			<span className="select-none"> · </span>
			<button
				type="button"
				disabled={isBusy}
				className="cursor-pointer underline-offset-4 transition-colors hover:text-primary hover:underline disabled:cursor-default disabled:opacity-50"
				onClick={onSwitchAccount}
			>
				Switch account
			</button>
		</p>
		<p
			role="alert"
			className={cn(
				layerClass,
				"text-destructive",
				!hasError && "pointer-events-none opacity-0",
			)}
			aria-hidden={!hasError}
		>
			That didn&apos;t go through. Refresh the link and try again.
		</p>
	</div>
);
