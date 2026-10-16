import { Button } from "@autumn/ui";

export const RolesLoadError = ({ onRetry }: { onRetry: () => void }) => (
	<div className="flex items-center justify-between gap-4 rounded-lg border border-dashed bg-interactive-secondary px-3 py-4 text-xs text-tertiary-foreground">
		Couldn't load roles.
		<Button variant="secondary" size="mini" onClick={onRetry}>
			Try again
		</Button>
	</div>
);
