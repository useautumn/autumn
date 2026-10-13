import { StatusChip } from "@autumn/ui";
import type { AtomChipDisplay } from "./atomDisplay";

export const AtomStatusChip = ({ chip }: { chip: AtomChipDisplay }) => (
	<StatusChip tone={chip.tone} glyph={chip.glyph}>
		{chip.label}
	</StatusChip>
);
