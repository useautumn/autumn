import { StatusChip } from "@autumn/ui";

export const RateLimitOverrideBadge = ({
	orgName,
	values,
}: {
	orgName: string;
	values: string[];
}) => (
	<StatusChip tone="purple" glyph="pencil">
		<span className="truncate">{orgName}</span>
		<span className="tabular-nums">{values.join(" · ")}</span>
	</StatusChip>
);
