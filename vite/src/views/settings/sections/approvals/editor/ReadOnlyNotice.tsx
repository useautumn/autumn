import { InfoIcon } from "@phosphor-icons/react";

export const ReadOnlyNotice = () => (
	<p className="flex gap-2 rounded-lg border bg-interactive-secondary p-3 text-sm text-tertiary-foreground">
		<InfoIcon className="mt-0.5 size-4 shrink-0" />
		This rule's conditions were saved in a shape the editor can't show as rows,
		so it opens read-only. You can still turn it on or off in the list, or
		delete it.
	</p>
);
