import { StatusChip } from "@autumn/ui";
import type { StatusChipConfig } from "../utils/planStatusConfig";

export function StatusConfigChip({ config }: { config: StatusChipConfig }) {
	return (
		<StatusChip tone={config.tone} glyph={config.glyph}>
			{config.label}
		</StatusChip>
	);
}
