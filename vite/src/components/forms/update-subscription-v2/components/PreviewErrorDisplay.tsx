import { WarningCircleIcon } from "@phosphor-icons/react";

export function PreviewErrorDisplay({ error }: { error: string }) {
	return (
		<div className="rounded-lg px-3 py-2.5 bg-destructive/10 text-destructive text-sm flex items-start gap-2">
			<WarningCircleIcon size={16} weight="fill" className="shrink-0 mt-0.5" />
			<span>{error}</span>
		</div>
	);
}
