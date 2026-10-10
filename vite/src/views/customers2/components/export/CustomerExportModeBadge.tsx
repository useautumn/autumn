import { StatusChip } from "@autumn/ui";

export function CustomerExportModeBadge({ apply }: { apply: boolean }) {
	return apply ? (
		<StatusChip tone="blue" glyph="pencil">
			Apply
		</StatusChip>
	) : (
		<StatusChip tone="neutral" glyph="dashed">
			Dry run
		</StatusChip>
	);
}
