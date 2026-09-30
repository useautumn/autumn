import { Alert, AlertDescription } from "@autumn/ui";
import { WarningCircleIcon } from "@phosphor-icons/react";

export function PreviewErrorDisplay({ error }: { error: string }) {
	return (
		<Alert variant="destructive">
			<WarningCircleIcon weight="fill" />
			<AlertDescription>{error}</AlertDescription>
		</Alert>
	);
}
