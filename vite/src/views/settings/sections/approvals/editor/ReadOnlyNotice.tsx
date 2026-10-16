import { InfoIcon } from "@phosphor-icons/react";

export type ReadOnlyReason = "not_editor" | "shape";

const MESSAGES: Record<ReadOnlyReason, string> = {
	not_editor: "Only owners and admins can change approval rules.",
	shape:
		"This rule was saved in a shape the editor can't show as rows, so it opens read-only. You can still turn it on or off in the list, or delete it.",
};

export const ReadOnlyNotice = ({ reason }: { reason: ReadOnlyReason }) => (
	<p className="flex gap-2 rounded-lg border bg-interactive-secondary p-3 text-sm text-tertiary-foreground">
		<InfoIcon className="mt-0.5 size-4 shrink-0" />
		{MESSAGES[reason]}
	</p>
);
