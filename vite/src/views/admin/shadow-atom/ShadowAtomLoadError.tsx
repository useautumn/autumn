import { Button } from "@autumn/ui";

export const ShadowAtomLoadError = ({
	what,
	onRetry,
}: {
	what: string;
	onRetry: () => void;
}) => (
	<div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 px-4 py-3">
		<p role="alert" className="text-sm text-destructive">
			Couldn't load {what}.
		</p>
		<Button variant="secondary" size="sm" onClick={onRetry}>
			Retry
		</Button>
	</div>
);
