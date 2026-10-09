import { StatusChip } from "@autumn/ui";

/** Whether a custom plans run wrote its flag changes or only reported them. */
export function CustomerExportModeBadge({ applied }: { applied: boolean }) {
	return applied ? (
		<StatusChip tone="blue" glyph="pencil">
			Applied
		</StatusChip>
	) : (
		<StatusChip tone="neutral" glyph="dashed">
			Dry run
		</StatusChip>
	);
}
